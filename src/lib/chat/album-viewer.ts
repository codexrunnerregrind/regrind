// Imported here rather than by each caller: a route that opens the viewer
// without also mounting one of the album grids would otherwise get an unstyled
// lightbox (`.pswp` falls back to `position: static`).
import "photoswipe/style.css";
import { goto } from "$app/navigation";
import type PhotoSwipeLightbox from "photoswipe/lightbox";

import { ApiError } from "$lib/api/api-error";
import {
	type AlbumContentResponse,
	getAlbumContent,
	getAlbumsPaywallContent,
} from "$lib/api/messaging/albums";
import {
	sendAlbumContentReaction,
	sendAlbumContentReply,
} from "$lib/api/messaging/messages";
import { callMethod } from "$lib/api/methods";
import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
import {
	measureImage,
	measureVideo,
	type MediaDimensions,
} from "$lib/util/media-dimensions";
import { applyPhotoSwipeVideo } from "$lib/util/photoswipe";
import { downloadMedia } from "./lightbox-download";
import {
	type MediaViewerActions,
	registerMediaViewerChrome,
} from "./media-viewer-chrome";

// Thrown when an album has no viewable content — typically a locked or expired
// shared album. Callers can catch this to show a friendlier message.
export class AlbumLockedError extends Error {
	constructor() {
		super("This album is locked or has expired.");
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
			sizes[index] = slide.contentType.startsWith("video/")
				? await measureVideo(slide.url)
				: await measureImage(slide.url);
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
 * caller opens the result without a `sharer` so that chrome stays off.
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

/** An album ready for the viewer, and where it had to be found. */
export type AlbumForViewing = {
	album: LoadedAlbum;
	/**
	 * The album itself was out of reach and this is the paywall teaser standing
	 * in for it: blurred previews, synthesised slide ids. Callers open it without
	 * reply chrome — there is nothing on it to reply to — and say so on screen.
	 */
	fromPaywall: boolean;
};

/**
 * Resolves an album to something the viewer can show, however it has to.
 *
 * Every way into the viewer wants the same chain, so it lives here rather than
 * in each of them: the album itself, and failing that the paywall teaser, which
 * still carries previews for shares we have lost access to. Throws
 * {@link AlbumLockedError} when neither has anything — the genuinely-gone case.
 *
 * Pass `viewable: false` for an album already known to be locked (a chat
 * message says so on its face) to skip the request that would only 403.
 */
export async function resolveAlbumForViewing({
	albumId,
	ownerProfileId,
	albumName,
	viewable = true,
}: {
	albumId: number;
	ownerProfileId?: number | null;
	albumName?: string | null;
	viewable?: boolean;
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
	album: LoadedAlbum,
	options: {
		startIndex?: number;
		onClosed?: () => void;
		sharer?: AlbumSharer;
	} = {},
): Promise<() => void> {
	const { startIndex = 0, onClosed, sharer } = options;
	// Locked/expired albums come back with no viewable content. PhotoSwipe would
	// crash trying to lay out zero slides, so surface a clear error instead.
	if (album.content.length === 0) {
		throw new AlbumLockedError();
	}
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
	// when the caller had no profile to hand.
	const toUserId = album.profileId;
	// Saving is offered either way — it is the viewer's own control, in the sender
	// row rather than the reply bar. Our own albums have nobody to reply to, so
	// that is all they get.
	const actions: MediaViewerActions = {
		onSave: (index) => {
			const slide = album.content[index];
			if (!slide) return;
			downloadMedia({ url: slide.url, mimeType: slide.contentType });
		},
		...(sharer === undefined
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
					onOpenChat: async () => {
						const ourProfileId = await callMethod(
							"auth_state",
						).catch(() => null);
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
		// only ever re-renders slides being preloaded off-screen.
		if (!sizer.measured(index)) {
			void sizer
				.ensure(index)
				.then(() => lightbox.pswp?.refreshSlideContent(index));
		}
		return { src: slide.url, ...sizer.sizeAt(index) };
	});
	// Video slides are handed to the custom player, which draws its own poster
	// and controls in place of PhotoSwipe's image content.
	applyPhotoSwipeVideo(lightbox, (index) => {
		const slide = album.content[index];
		if (!slide?.contentType.startsWith("video/")) return null;
		return { src: slide.url, poster: slide.coverUrl };
	});
	// No download button on PhotoSwipe's toolbar: the chrome hides it and puts
	// saving in its sender row (see `actions.onSave` above).
	const onBackGesture = () => {
		lightbox.pswp?.close();
		return false;
	};
	lightbox.on("beforeOpen", () => {
		backGestureEventHandlers.add(onBackGesture);
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
						profileId: toUserId,
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
