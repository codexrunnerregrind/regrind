// Imported here rather than by each caller, so any route that opens the gallery
// gets a styled lightbox (`.pswp` falls back to `position: static` without it).
import "photoswipe/style.css";
import type PhotoSwipeLightbox from "photoswipe/lightbox";

import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
import {
	downloadAllMedia,
	downloadMedia,
	registerLightboxDownloadButton,
} from "./lightbox-download";
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
	/** Stamped as taken on Grindr, which the chrome shows beside the sender. */
	takenOnGrindr?: boolean;
	/** When it was taken, for that stamp. */
	createdAt?: number | null;
};

// Room left for PhotoSwipe's own toolbar when the gallery has no chrome of its
// own. With chrome there is no padding at all: its bars float over the photo.
const TOOLBAR_INSET = 64;

/**
 * PhotoSwipe lays a slide out from its intrinsic size, and given 0x0 it
 * stretches the image over the whole viewport — under the chrome, ignoring the
 * padding meant to keep it clear. Images whose dimensions the message didn't
 * carry (an expiring photo, say) are measured here first; the browser then has
 * them cached, so the viewer still opens straight away.
 */
async function measure(
	image: GalleryImage,
): Promise<{ width: number; height: number }> {
	if (image.width !== null && image.height !== null) {
		return { width: image.width, height: image.height };
	}
	const img = document.createElement("img");
	img.src = image.url;
	try {
		return await new Promise((resolve) => {
			const done = () =>
				resolve({ width: img.naturalWidth, height: img.naturalHeight });
			if (img.complete) {
				done();
				return;
			}
			img.addEventListener("load", done, { once: true });
			// A photo we can't measure is no worse off than it was before.
			img.addEventListener(
				"error",
				() => resolve({ width: 0, height: 0 }),
				{ once: true },
			);
		});
	} finally {
		img.remove();
	}
}

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
	// Whose photos these are, so a save names them after their owner. The header
	// already carries it, and leaves it out for our own.
	const profileId = chrome?.header.profileId ?? null;
	// Saving moves into the chrome's sender row wherever the chrome is mounted —
	// it hides the toolbar the download button would otherwise sit on.
	const actions: MediaViewerActions | undefined =
		chrome === undefined
			? undefined
			: {
					...chrome.actions,
					onSave: (index) => {
						const image = images[index];
						if (image) downloadMedia({ url: image.url, profileId });
					},
					// Only where there is more than one to save.
					...(images.length > 1
						? {
								onSaveAll: () =>
									downloadAllMedia(
										images.map(({ url }) => ({
											url,
											profileId,
										})),
									),
							}
						: {}),
				};
	const [{ default: PhotoSwipeLightboxCtor }, sizes] = await Promise.all([
		import("photoswipe/lightbox"),
		Promise.all(images.map(measure)),
	]);
	const lightbox: PhotoSwipeLightbox = new PhotoSwipeLightboxCtor({
		showHideAnimationType: "fade",
		pswpModule: () => import("photoswipe"),
		mainClass: `pswp--buttons-visible`,
		// The photo fills the screen instead of letting the conversation show
		// through a translucent backdrop.
		bgOpacity: 1,
		// The chrome's progress bar says where we are, so the counter is redundant.
		counter: chrome === undefined,
		// Only the bare viewer pads: the chrome's bars sit over the photo.
		paddingFn: () =>
			actions === undefined
				? { top: TOOLBAR_INSET, bottom: 0, left: 0, right: 0 }
				: { top: 0, bottom: 0, left: 0, right: 0 },
	});
	lightbox.addFilter("numItems", () => images.length);
	lightbox.addFilter("itemData", (itemData, index) => {
		const image = images[index];
		if (!image) return itemData;
		return { src: image.url, ...sizes[index] };
	});
	if (actions === undefined) {
		registerLightboxDownloadButton(lightbox, (index) => {
			const image = images[index];
			return image ? { url: image.url, profileId } : null;
		});
	}
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
	if (chrome !== undefined && actions !== undefined) {
		registerMediaViewerChrome(lightbox, {
			count: images.length,
			header: chrome.header,
			actions,
			// Read off the slides themselves: every caller already carries the
			// flag on the photo, so none has to pass the stamp separately.
			stamp: (index) => {
				const image = images[index];
				return image?.takenOnGrindr === true
					? { createdAt: image.createdAt ?? null }
					: null;
			},
		});
	}
	if (onClosed) {
		lightbox.on("closingAnimationEnd", onClosed);
	}
	lightbox.init();
	lightbox.loadAndOpen(startIndex);
	return () => lightbox.destroy();
}
