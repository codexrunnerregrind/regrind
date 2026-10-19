// Imported here rather than by each caller: a route that opens the viewer
// without also mounting one of the album grids would otherwise get an unstyled
// lightbox (`.pswp` falls back to `position: static`).
import "photoswipe/style.css";
import { goto } from "$app/navigation";
import type PhotoSwipeLightbox from "photoswipe/lightbox";

import { ApiError } from "$lib/api/api-error";
import { signedInProfileId } from "$lib/api/current-session";
import {
	type AlbumContentResponse,
	getAlbumContent,
	getAlbumsPaywallContent,
} from "$lib/api/messaging/albums";
import {
	sendAlbumContentReaction,
	sendAlbumContentReply,
} from "$lib/api/messaging/messages";
import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
import {
	measureImage,
	measureVideo,
	type MediaDimensions,
} from "$lib/util/media-dimensions";
import {
	applyPhotoSwipeVideo,
	applyPhotoSwipeViewportSync,
} from "$lib/util/photoswipe";
import { downloadAllMedia, downloadMedia } from "./lightbox-download";
import {
	type MediaViewerActions,
	registerMediaViewerChrome,
} from "./media-viewer-chrome";
import { myAlbum } from "./my-albums";

// Thrown when an album has no viewable content — typically a locked or expired
// shared album. Callers can catch this to show a friendlier message.
export class AlbumLockedError extends Error {
	constructor(message = "This album is locked or has expired.") {
		super(message);
		this.name = "AlbumLockedError";
	}
}

/**
 * Who shared the album, for the viewer's header. Every field is optional: the
 * shares feed carries the sharer's profile, but an album opened from its own
 * page only knows the album itself, and the header falls back to that.
 */
export type AlbumSharer = {
	name?: string | null;
	avatarUrl?: string | null;
	distanceKm?: number | null;
};

/**
 * An album ready for the viewer. Slides carry no dimensions: the API does not
 * report any, and measuring them all up front is what used to make opening an
 * album slow (see {@link createSlideSizer}).
 */
export type LoadedAlbum = AlbumContentResponse;

type AlbumSlide = LoadedAlbum["content"][number];

const isVideo = (slide: AlbumSlide) => slide.contentType.startsWith("video/");

// A slide's size while its media is still being measured. PhotoSwipe lays a
// slide out from its intrinsic size and given 0x0 it stretches it over the whole
// viewport, so the viewport is the placeholder that looks least wrong.
function viewportSize(): MediaDimensions {
	return { width: window.innerWidth, height: window.innerHeight };
}

type SlideSizer = {
	/** Whether this slide's real size is already in hand. */
	measured(index: number): boolean;
	/** The real size if known, and the placeholder until then. */
	sizeAt(index: number): MediaDimensions;
	/** Measures the slide, or joins the measurement already under way. */
	ensure(index: number): Promise<void>;
};

/**
 * Measures slides one at a time, on demand.
 *
 * PhotoSwipe needs a slide's intrinsic size to lay it out and the album payload
 * carries none, so every size costs a media load. Measuring the whole album up
 * front meant an album only opened once every one of its photos had been
 * downloaded in full — a wait that grew with the album. So the viewer measures
 * the slide it opens on, and leaves the rest to be measured as PhotoSwipe
 * reaches them, which is media it was going to load anyway.
 */
function createSlideSizer(content: LoadedAlbum["content"]): SlideSizer {
	const sizes: (MediaDimensions | null)[] = content.map(() => null);
	const pending = new Map<number, Promise<void>>();
	const measure = async (index: number) => {
		const slide = content[index];
		if (slide === undefined) return;
		try {
			// A video's cover is the cheaper measurement and has the same
			// frame; only a video without one has to be loaded to be measured.
			const cover = isVideo(slide) ? slide.coverUrl : slide.url;
			sizes[index] =
				cover === null
					? await measureVideo(slide.url)
					: await measureImage(cover);
		} catch (error) {
			// A slide we cannot measure keeps the placeholder — and counts as
			// measured, so it is not asked for again on every re-render.
			console.error(error);
			sizes[index] = viewportSize();
		}
	};
	return {
		measured: (index) => (sizes[index] ?? null) !== null,
		sizeAt: (index) => sizes[index] ?? viewportSize(),
		ensure: (index) => {
			const existing = pending.get(index);
			if (existing !== undefined) return existing;
			const measuring = measure(index);
			pending.set(index, measuring);
			return measuring;
		},
	};
}

// Fetches an album. Its slides are measured later, by the viewer.
export async function loadAlbum(albumId: number): Promise<LoadedAlbum> {
	return await getAlbumContent(albumId);
}

/**
 * The fallback for an album `GET /v2/albums/{albumId}` will not hand over — a
 * share past its expiry, or one over the account's viewable-album allowance.
 * Those albums still appear in the paywall teaser with real media urls, so this
 * builds a viewable album out of that instead of leaving a dead tile.
 *
 * The teaser carries no per-item metadata, so the slides are synthesised: the
 * urls are images, and reply/react ids would be meaningless here anyway — the
 * caller opens the result as `fromPaywall` so those controls stay off.
 *
 * Returns `null` when the album is not in the teaser either, which is the
 * genuinely-gone case the lock message is for.
 */
export async function loadPaywallAlbum({
	albumId,
	ownerProfileId,
	albumName,
}: {
	albumId: number;
	ownerProfileId?: number | null;
	albumName?: string | null;
}): Promise<LoadedAlbum | null> {
	// Asking for the owner's albums first keeps the response small; the
	// unfiltered call is the retry for when that comes back without the album
	// (or when we never learned who shared it).
	const find = async (counterpartyId: number | null) =>
		(await getAlbumsPaywallContent(counterpartyId)).find(
			(it) => it.albumId === albumId,
		);
	const entry =
		(ownerProfileId === undefined || ownerProfileId === null
			? undefined
			: await find(ownerProfileId)) ?? (await find(null));
	// `paywallUrls` already leads with the cover, so `paywallCoverUrl` is only a
	// fallback for the empty case — appending it unconditionally duplicated the
	// first slide as the last one. Dedupe by the CDN path (minus the per-request
	// signature query) so the same file under two different signed urls collapses
	// to one slide.
	const seen = new Set<string>();
	const urls = [
		...(entry?.paywallUrls ?? []),
		...(entry?.paywallCoverUrl ? [entry.paywallCoverUrl] : []),
	].filter((url) => {
		if (!url.startsWith("https://")) return false;
		const key = url.split("?")[0] ?? url;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
	if (urls.length === 0) return null;

	const now = new Date().toISOString().slice(0, 19);
	const content = urls.map((url, index) => ({
		contentId: -(index + 1),
		contentType: "image/jpeg",
		coverUrl: url,
		statusId: 0,
		thumbUrl: url,
		url,
		processing: false,
		rejectionId: null,
	}));
	return {
		albumId,
		albumName: albumName ?? null,
		hasUnseenContent: false,
		profileId: ownerProfileId ?? entry?.profile?.profileId ?? 0,
		albumViewable: true,
		sharedCount: 0,
		createdAt: now,
		updatedAt: now,
		content,
	};
}

/**
 * One of our own albums, straight from our album list.
 *
 * `GET /v2/albums/{albumId}` is the entitled-*viewer* endpoint: it answers with
 * nothing once the share behind a bubble is revoked or expired, and it does that
 * even for an album we own — which is what used to make our own locked bubble
 * report itself as locked or expired. `GET /v1/albums` has no share to consult,
 * so it is the one that still hands over our album in full.
 *
 * Returns `null` when we own no such album (it was deleted, or it was never
 * ours), which is the caller's cue to keep looking.
 */
async function loadOwnAlbum(albumId: number): Promise<LoadedAlbum | null> {
	const album = await myAlbum(albumId);
	if (album === null || album.content.length === 0) return null;
	return {
		albumId: album.albumId,
		albumName: album.albumName,
		hasUnseenContent: false,
		profileId: album.profileId,
		albumViewable: true,
		sharedCount: album.sharedCount,
		createdAt: album.createdAt,
		updatedAt: album.updatedAt,
		content: album.content,
	};
}

/** An album ready for the viewer, and where it had to be found. */
export type AlbumForViewing = {
	album: LoadedAlbum;
	/**
	 * The album itself was out of reach and this is the paywall teaser standing
	 * in for it: blurred previews, synthesised slide ids. Callers pass this on to
	 * {@link openAlbumLightbox}, which drops the controls that point at a single
	 * photo, and say so on screen.
	 */
	fromPaywall: boolean;
};

/**
 * Resolves an album to something the viewer can show, however it has to.
 *
 * Every way into the viewer wants the same chain, so it lives here rather than
 * in each of them: the album itself, then our own album list when the album is
 * ours, and failing both the paywall teaser, which still carries previews for
 * shares we have lost access to. Throws {@link AlbumLockedError} when none has
 * anything — the genuinely-gone case.
 *
 * Pass `viewable: false` for an album already known to be locked (a chat
 * message says so on its face) to skip the request that would only 403. Pass
 * `ours: true` for an album we own: the lock on it is the recipient's side of a
 * share we revoked, so it opens in full from {@link loadOwnAlbum} — and never
 * from the teaser, which only ever lists albums we are being upsold.
 */
export async function resolveAlbumForViewing({
	albumId,
	ownerProfileId,
	albumName,
	viewable = true,
	ours = false,
}: {
	albumId: number;
	ownerProfileId?: number | null;
	albumName?: string | null;
	viewable?: boolean;
	ours?: boolean;
}): Promise<AlbumForViewing> {
	// 403 is the API's other way of saying "not for you"; an album that comes
	// back present but empty means the same thing. Both fall through.
	const album = viewable
		? await loadAlbum(albumId).catch((error: unknown) => {
				if (error instanceof ApiError && error.response?.status === 403)
					return null;
				throw error;
			})
		: null;
	if (album !== null && album.content.length > 0)
		return { album, fromPaywall: false };

	// Our own album, refused by the viewer endpoint because the share is off:
	// our album list still has it, in full and with nothing blurred.
	if (ours) {
		const own = await loadOwnAlbum(albumId).catch((error: unknown) => {
			console.error(error);
			return null;
		});
		if (own !== null) return { album: own, fromPaywall: false };
	}

	// A teaser that errors out is still just an album we cannot show, so it
	// reports as locked rather than as a failure of its own.
	const teaser = await loadPaywallAlbum({
		albumId,
		ownerProfileId,
		albumName,
	}).catch((error: unknown) => {
		console.error(error);
		return null;
	});
	if (teaser === null) throw new AlbumLockedError();
	return { album: teaser, fromPaywall: true };
}

// Opens a measured album in a PhotoSwipe lightbox, wiring up video slides and
// the platform back gesture. Resolves with a teardown function; call it to
// destroy the lightbox (e.g. when the owning component unmounts).
//
// Pass `sharer` for an album somebody shared with us and the viewer can reply
// to it and react to it. Our own albums get the same header and progress, just
// without a bar — there is nobody to reply to.
export async function openAlbumLightbox(
	input: LoadedAlbum,
	options: {
		startIndex?: number;
		onClosed?: () => void;
		sharer?: AlbumSharer;
		/**
		 * These slides stand in for an album we were refused — see
		 * {@link loadPaywallAlbum}. Their ids are synthesised, so the controls that
		 * point at one photo are left off; the ones that only need the person are
		 * not.
		 */
		fromPaywall?: boolean;
	} = {},
): Promise<() => void> {
	const {
		startIndex: requestedIndex = 0,
		onClosed,
		sharer,
		fromPaywall = false,
	} = options;
	// An item the API is still transcoding has no media to show — every url it
	// carries 404s — so it is left out of the slides rather than opened as one
	// that cannot load. Filtered here, so it holds for every way in: the album
	// page, a chat bubble, the album grids.
	const ready = input.content.filter((item) => item.processing !== true);
	// Locked/expired albums come back with no viewable content. PhotoSwipe would
	// crash trying to lay out zero slides, so surface a clear error instead.
	if (ready.length === 0) {
		throw new AlbumLockedError(
			input.content.length > 0
				? "Still processing — it will play once it is ready."
				: undefined,
		);
	}
	// The caller counted from the whole album, so the slide it asked for is
	// found again in what is left rather than trusted as a position.
	const asked = input.content[requestedIndex];
	const startIndex = Math.max(
		asked === undefined ? 0 : ready.indexOf(asked),
		0,
	);
	const album: LoadedAlbum = { ...input, content: ready };
	// Measuring the opening slide and fetching PhotoSwipe are both waits before
	// anything can appear, so they run together. The core module is its own chunk
	// that PhotoSwipe would otherwise only start fetching from `init`, by which
	// point it is the last thing standing between the tap and the photo.
	const sizer = createSlideSizer(album.content);
	const measuringStart = sizer.ensure(startIndex);
	const pswpModule = import("photoswipe");
	// The rejection is reported where PhotoSwipe awaits it; this only keeps it
	// from counting as unhandled in the meantime.
	pswpModule.catch(() => {});
	const { default: PhotoSwipeLightboxCtor } =
		await import("photoswipe/lightbox");
	// The album payload names its owner, so replies reach the right person even
	// when the caller had no profile to hand. A teaser does not always know whose
	// album it stood in for, and settles for 0 when it does not — with no profile
	// there is no chat to open and nowhere for the header to link.
	const toUserId = album.profileId;
	const ownerKnown = toUserId > 0;
	// Saving is offered either way — it is the viewer's own control, in the sender
	// row rather than the reply bar. Our own albums have nobody to reply to, so
	// that is all they get.
	const actions: MediaViewerActions = {
		onSave: (index) => {
			const slide = album.content[index];
			if (!slide) return;
			downloadMedia({
				url: slide.url,
				mimeType: slide.contentType,
				profileId: toUserId,
			});
		},
		// Only where there is more than one to save.
		...(album.content.length > 1
			? {
					onSaveAll: () =>
						downloadAllMedia(
							album.content.map((slide) => ({
								url: slide.url,
								mimeType: slide.contentType,
								profileId: toUserId,
							})),
						),
				}
			: {}),
		// A teaser's slides are synthesised — placeholder ids standing in for
		// content we were never handed — so there is nothing on them to reply to
		// or react to. The field stays on screen saying as much, since a bar that
		// silently loses its composer just looks broken.
		...(sharer !== undefined && fromPaywall
			? { replyUnavailable: "Preview only" }
			: {}),
		...(sharer === undefined || fromPaywall
			? {}
			: {
					onReply: async (reply, index) => {
						const slide = album.content[index];
						if (!slide) return;
						await sendAlbumContentReply({
							toUserId,
							albumId: album.albumId,
							albumContentId: slide.contentId,
							reply,
						});
					},
					onReact: async (index) => {
						const slide = album.content[index];
						if (!slide) return;
						await sendAlbumContentReaction({
							toUserId,
							albumId: album.albumId,
							albumContentId: slide.contentId,
						});
					},
				}),
		// Reaching the person needs only the person, so this survives a teaser: an
		// album we have lost access to is still a reason to say something to
		// whoever shared it.
		...(sharer === undefined || !ownerKnown
			? {}
			: {
					onOpenChat: async () => {
						const ourProfileId = await signedInProfileId().catch(
							() => null,
						);
						if (ourProfileId === null) return;
						const conversationId = [toUserId, ourProfileId]
							.toSorted((a, b) => a - b)
							.join(":");
						// Closing first: the lightbox is a body-level overlay, so it
						// would sit on top of the conversation we're navigating to.
						lightbox.pswp?.close();
						await goto(`/chat/${conversationId}`);
					},
				}),
	};
	const lightbox: PhotoSwipeLightbox = new PhotoSwipeLightboxCtor({
		showHideAnimationType: "fade",
		pswpModule: () => pswpModule,
		mainClass: `pswp--buttons-visible`,
		// The album fills the screen the way the official viewer does, instead of
		// letting the screen underneath show through a translucent backdrop.
		bgOpacity: 1,
		// The chrome's progress bar says where we are, so the counter is redundant.
		counter: false,
	});
	lightbox.addFilter("numItems", () => album.content.length);
	lightbox.addFilter("itemData", (itemData, index) => {
		const slide = album.content[index];
		if (!slide) return itemData;
		// A slide PhotoSwipe reaches before its media has been measured is laid
		// out at the placeholder size and re-rendered once the real one is in.
		// The slide the viewer opens on is measured below before `init`, so this
		// only ever re-renders slides being preloaded off-screen. A video's own
		// size does not decide its layout, and re-rendering one would remount
		// its player, so videos are left alone.
		if (!isVideo(slide) && !sizer.measured(index)) {
			void sizer
				.ensure(index)
				.then(() => lightbox.pswp?.refreshSlideContent(index));
		}
		// PhotoSwipe's fit zoom never scales a slide past its intrinsic size,
		// which is right for a photo — upscaling one only blurs it. A video is
		// measured from its cover, a thumbnail far smaller than the screen, so
		// that left it playing in a small box while the photos beside it filled
		// the viewport. Video slides take the viewport as their size and the
		// player's `object-contain` letterboxes inside it, the way any
		// full-screen player draws them.
		return {
			src: slide.url,
			...(isVideo(slide) ? viewportSize() : sizer.sizeAt(index)),
		};
	});
	// Re-measures once the opening animation lands, so a viewer opened while the
	// keyboard was up centres on the screen it actually got.
	applyPhotoSwipeViewportSync(lightbox);
	// Video slides are handed to the custom player, which draws its own poster
	// and controls in place of PhotoSwipe's image content.
	applyPhotoSwipeVideo(lightbox, (index) => {
		const slide = album.content[index];
		if (!slide || !isVideo(slide)) return null;
		return { src: slide.url, poster: slide.coverUrl };
	});
	// No download button on PhotoSwipe's toolbar: the chrome hides it and puts
	// saving in its sender row (see `actions.onSave` above).
	const onBackGesture = () => {
		lightbox.pswp?.close();
		return false;
	};
	lightbox.on("beforeOpen", () => {
		backGestureEventHandlers.set(onBackGesture, "overlay");
	});
	lightbox.on("close", () => {
		backGestureEventHandlers.delete(onBackGesture);
	});
	registerMediaViewerChrome(lightbox, {
		count: album.content.length,
		header:
			sharer === undefined
				? // Our own album: its name is what identifies it, and there is no
					// profile to link to that we aren't already.
					{ fallbackName: album.albumName?.trim() || "Your album" }
				: {
						// Without an owner the header is a name rather than a way into
						// a profile — better than linking to nobody.
						...(ownerKnown ? { profileId: toUserId } : {}),
						name: sharer.name,
						avatarUrl: sharer.avatarUrl,
						distanceKm: sharer.distanceKm,
						fallbackName: album.albumName?.trim() || "Album",
					},
		actions,
	});
	if (onClosed) {
		lightbox.on("closingAnimationEnd", onClosed);
	}
	// The viewer opens as soon as the slide it lands on can be laid out; the rest
	// are measured as PhotoSwipe reaches them.
	await measuringStart;
	lightbox.init();
	lightbox.loadAndOpen(startIndex);
	return () => lightbox.destroy();
}
