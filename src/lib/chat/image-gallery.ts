import type PhotoSwipeLightbox from "photoswipe/lightbox";

import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
import { registerLightboxDownloadButton } from "./lightbox-download";

// A single image shared in a conversation. Width/height may be unknown (null),
// in which case PhotoSwipe measures the image once it loads.
export type GalleryImage = {
	url: string;
	width: number | null;
	height: number | null;
};

// Opens a swipeable lightbox spanning every loose image in a conversation,
// starting at `startIndex`. Mirrors `openAlbumLightbox` so single photos and
// albums behave the same once open. Resolves with a teardown function; call it
// to destroy the lightbox (e.g. when the owning component unmounts).
export async function openImageGalleryLightbox(
	images: GalleryImage[],
	options: { startIndex?: number; onClosed?: () => void } = {},
): Promise<() => void> {
	const { startIndex = 0, onClosed } = options;
	if (images.length === 0) {
		throw new Error("No images to display");
	}
	const { default: PhotoSwipeLightboxCtor } = await import(
		"photoswipe/lightbox"
	);
	const lightbox: PhotoSwipeLightbox = new PhotoSwipeLightboxCtor({
		showHideAnimationType: "fade",
		pswpModule: () => import("photoswipe"),
		mainClass: `pswp--buttons-visible`,
	});
	lightbox.addFilter("numItems", () => images.length);
	lightbox.addFilter("itemData", (_, index) => {
		const { url, width, height } = images[index];
		return { src: url, width: width ?? 0, height: height ?? 0 };
	});
	registerLightboxDownloadButton(lightbox, (index) => {
		const image = images[index];
		return image ? { url: image.url } : null;
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
	if (onClosed) {
		lightbox.on("closingAnimationEnd", onClosed);
	}
	lightbox.init();
	lightbox.loadAndOpen(startIndex);
	return () => lightbox.destroy();
}
