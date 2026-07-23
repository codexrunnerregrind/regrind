import type PhotoSwipeLightbox from "photoswipe/lightbox";

import { type AlbumContentResponse, getAlbumContent } from "$lib/api/messaging/albums";
import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";

// An album whose slides have been measured so PhotoSwipe can size them.
export type LoadedAlbum = AlbumContentResponse & {
	content: (AlbumContentResponse["content"][number] & {
		width: number;
		height: number;
	})[];
};

// Fetches an album and measures every slide's intrinsic dimensions, which
// PhotoSwipe needs up front to lay out the lightbox.
export async function loadAlbum(albumId: number): Promise<LoadedAlbum> {
	const res = await getAlbumContent(albumId);
	const content = await Promise.all(
		res.content.map(async (slide) => {
			if (slide.contentType.startsWith("video/")) {
				const video = document.createElement("video");
				video.src = slide.url ?? "";
				video.load();
				try {
					await new Promise<void>((resolve, reject) => {
						if (video.readyState >= 1) resolve();
						video.addEventListener("loadedmetadata", () => resolve(), {
							once: true,
						});
						video.addEventListener(
							"error",
							({ error }) =>
								reject(
									new Error(`Failed to load video: ${slide.url}`, {
										cause: error,
									}),
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
						img.addEventListener("load", () => resolve(), { once: true });
						img.addEventListener(
							"error",
							({ error }) =>
								reject(
									new Error(`Failed to load image: ${slide.url}`, {
										cause: error,
									}),
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
	return { ...res, content };
}

// Opens a measured album in a PhotoSwipe lightbox, wiring up video slides and
// the platform back gesture. Resolves with a teardown function; call it to
// destroy the lightbox (e.g. when the owning component unmounts).
export async function openAlbumLightbox(
	album: LoadedAlbum,
	options: { startIndex?: number; onClosed?: () => void } = {},
): Promise<() => void> {
	const { startIndex = 0, onClosed } = options;
	const { default: PhotoSwipeLightboxCtor } = await import(
		"photoswipe/lightbox"
	);
	const lightbox: PhotoSwipeLightbox = new PhotoSwipeLightboxCtor({
		showHideAnimationType: "fade",
		pswpModule: () => import("photoswipe"),
		mainClass: `pswp--buttons-visible`,
	});
	lightbox.addFilter("numItems", () => album.content.length);
	lightbox.addFilter("itemData", (_, index) => {
		const { url, width, height } = album.content[index];
		return { src: url, width, height };
	});
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
	lightbox.on("contentLoad", (event) => {
		const { content } = event;
		const slide = album.content[content.index];
		if (slide?.contentType.startsWith("video/")) {
			event.preventDefault();
			content.element = document.createElement("div");
			const video = document.createElement("video");
			video.src = slide.url;
			video.controls = true;
			video.playsInline = true;
			video.className = "max-w-full max-h-full m-auto";
			content.element.appendChild(video);
			content.state = "loading";
			if (video.readyState >= 3) {
				content.onLoaded();
			} else {
				video.addEventListener("loadeddata", () => content.onLoaded());
				video.addEventListener("error", () => content.onError());
			}
		}
	});
	if (onClosed) {
		lightbox.on("closingAnimationEnd", onClosed);
	}
	lightbox.init();
	lightbox.loadAndOpen(startIndex);
	return () => lightbox.destroy();
}
