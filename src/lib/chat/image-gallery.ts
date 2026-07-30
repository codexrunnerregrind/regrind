// Imported here rather than by each caller, so any route that opens the gallery
// gets a styled lightbox (`.pswp` falls back to `position: static` without it).
import "photoswipe/style.css";
import type PhotoSwipeLightbox from "photoswipe/lightbox";

import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
import { registerLightboxDownloadButton } from "./lightbox-download";
import {
	type MediaViewerActions,
	type MediaViewerHeader,
	registerMediaViewerChrome,
} from "./media-viewer-chrome";

// A single image shared in a conversation. Width/height may be unknown (null),
// in which case PhotoSwipe measures the image once it loads.
export type GalleryImage = {
	url: string;
	width: number | null;
	height: number | null;
};

// Room left for PhotoSwipe's own toolbar when the gallery has no chrome of its
// own, and the starting guesses for the chrome's two bars — the mounted chrome
// measures itself and reports the real heights straight after.
const TOOLBAR_INSET = 64;
const CHROME_TOP_INSET = 104;
const CHROME_BOTTOM_INSET = 88;

// Opens a swipeable lightbox spanning every loose image in a conversation,
// starting at `startIndex`. Mirrors `openAlbumLightbox` so single photos and
// albums behave the same once open. Resolves with a teardown function; call it
// to destroy the lightbox (e.g. when the owning component unmounts).
//
// Pass `chrome` to get the same story-style header and reply bar the album
// viewer uses — whose photos these are, where in the set you are, and what the
// bar can do with the one on screen.
export async function openImageGalleryLightbox(
	images: GalleryImage[],
	options: {
		startIndex?: number;
		onClosed?: () => void;
		chrome?: { header: MediaViewerHeader; actions: MediaViewerActions };
	} = {},
): Promise<() => void> {
	const { startIndex = 0, onClosed, chrome } = options;
	if (images.length === 0) {
		throw new Error("No images to display");
	}
	const { default: PhotoSwipeLightboxCtor } =
		await import("photoswipe/lightbox");
	const insets =
		chrome === undefined
			? { top: TOOLBAR_INSET, bottom: 0 }
			: { top: CHROME_TOP_INSET, bottom: CHROME_BOTTOM_INSET };
	const lightbox: PhotoSwipeLightbox = new PhotoSwipeLightboxCtor({
		showHideAnimationType: "fade",
		pswpModule: () => import("photoswipe"),
		mainClass: `pswp--buttons-visible`,
		// The photo fills the screen instead of letting the conversation show
		// through a translucent backdrop.
		bgOpacity: 1,
		// The chrome's progress bar says where we are, so the counter is redundant.
		counter: chrome === undefined,
		// Keeps the photo clear of the chrome rather than centred behind it.
		paddingFn: () => ({ ...insets, left: 0, right: 0 }),
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
	if (chrome !== undefined) {
		registerMediaViewerChrome(lightbox, {
			count: images.length,
			insets,
			header: chrome.header,
			actions: chrome.actions,
		});
	}
	if (onClosed) {
		lightbox.on("closingAnimationEnd", onClosed);
	}
	lightbox.init();
	lightbox.loadAndOpen(startIndex);
	return () => lightbox.destroy();
}
