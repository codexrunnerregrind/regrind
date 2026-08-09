// Imported here rather than by each caller: a route that opens the viewer
// without also mounting one of the album grids would otherwise get an unstyled
// lightbox (`.pswp` falls back to `position: static`).
import "photoswipe/style.css";
import { goto } from "$app/navigation";
import type PhotoSwipeLightbox from "photoswipe/lightbox";

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

// An album whose slides have been measured so PhotoSwipe can size them.
export type LoadedAlbum = AlbumContentResponse & {
	content: (AlbumContentResponse["content"][number] & {
		width: number;
		height: number;
	})[];
};

// Measures every slide's intrinsic dimensions, which PhotoSwipe needs up front
// to lay out the lightbox.
async function measureSlides<
	TSlide extends { contentType: string; url: string },
>(slides: TSlide[]): Promise<(TSlide & { width: number; height: number })[]> {
	return await Promise.all(
		slides.map(async (slide) => {
			if (slide.contentType.startsWith("video/")) {
				const video = document.createElement("video");
				video.src = slide.url ?? "";
				video.load();
				try {
					await new Promise<void>((resolve, reject) => {
						if (video.readyState >= 1) resolve();
						video.addEventListener(
							"loadedmetadata",
							() => resolve(),
							{ once: true },
						);
						video.addEventListener(
							"error",
							({ error }) =>
								reject(
									new Error(
										`Failed to load video: ${slide.url}`,
										{ cause: error },
									),
								),
							{ once: true },
						);
					});
					return {
						...slide,
						width: video.videoWidth,
						height: video.videoHeight,
					};
				} finally {
					video.remove();
				}
			} else {
				const img = document.createElement("img");
				img.src = slide.url ?? "";
				try {
					await new Promise<void>((resolve, reject) => {
						if (img.complete) resolve();
						img.addEventListener("load", () => resolve(), {
							once: true,
						});
						img.addEventListener(
							"error",
							({ error }) =>
								reject(
									new Error(
										`Failed to load image: ${slide.url}`,
										{ cause: error },
									),
								),
							{ once: true },
						);
					});
					return {
						...slide,
						width: img.naturalWidth,
						height: img.naturalHeight,
					};
				} finally {
					img.remove();
				}
			}
		}),
	);
}

// Fetches an album and measures its slides.
export async function loadAlbum(albumId: number): Promise<LoadedAlbum> {
	const res = await getAlbumContent(albumId);
	return { ...res, content: await measureSlides(res.content) };
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
		(ownerProfileId == null ? undefined : await find(ownerProfileId)) ??
		(await find(null));
	const urls = [
		...(entry?.paywallUrls ?? []),
		...(entry?.paywallCoverUrl ? [entry.paywallCoverUrl] : []),
	].filter((url) => url.startsWith("https://"));
	if (urls.length === 0) return null;

	const now = new Date().toISOString().slice(0, 19);
	const content = await measureSlides(
		urls.map((url, index) => ({
			contentId: -(index + 1),
			contentType: "image/jpeg",
			coverUrl: url,
			statusId: 0,
			thumbUrl: url,
			url,
			processing: false,
			rejectionId: null,
		})),
	);
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
		pswpModule: () => import("photoswipe"),
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
		return { src: slide.url, width: slide.width, height: slide.height };
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
	lightbox.init();
	lightbox.loadAndOpen(startIndex);
	return () => lightbox.destroy();
}
