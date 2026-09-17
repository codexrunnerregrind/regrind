// Imported here rather than by each caller, so any route that opens the viewer
// gets a styled lightbox (`.pswp` falls back to `position: static` without it).
import "photoswipe/style.css";
import type PhotoSwipeLightbox from "photoswipe/lightbox";

import {
	applyPhotoSwipeBackGesture,
	applyPhotoSwipeErrorUi,
	applyPhotoSwipeVideo,
	applyPhotoSwipeViewportSync,
} from "$lib/util/photoswipe";
import {
	downloadMedia,
	registerLightboxDownloadButton,
} from "./lightbox-download";
import {
	type MediaViewerActions,
	type MediaViewerHeader,
	registerMediaViewerChrome,
} from "./media-viewer-chrome";

/** A single clip sent in a conversation. */
export type ViewerVideo = {
	url: string;
	/** The API's `contentType`, so the save names the file correctly. */
	mimeType?: string | null;
	looping?: boolean | null;
};

// Room left for PhotoSwipe's own toolbar when the viewer has no chrome.
const TOOLBAR_INSET = 64;

// A video slide takes the viewport: PhotoSwipe's fit zoom never scales a slide
// past its intrinsic size, so measuring the clip would leave it playing in a
// small box. The player's `object-contain` letterboxes inside it instead.
function viewportSize(): { width: number; height: number } {
	return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * Opens one video in the media viewer — the same lightbox an album's clips play
 * in, so a chat video gets the app's own player, its save control and the back
 * gesture instead of the webview's native controls. Resolves with a teardown
 * function; call it to destroy the lightbox.
 *
 * Pass `chrome` for the story-style header and reply bar; without it the viewer
 * is bare, with saving on PhotoSwipe's toolbar.
 */
export async function openVideoLightbox(
	video: ViewerVideo,
	options: {
		onClosed?: () => void;
		chrome?: { header: MediaViewerHeader; actions: MediaViewerActions };
	} = {},
): Promise<() => void> {
	const { onClosed, chrome } = options;
	const target = {
		url: video.url,
		// Whose clip it is, so a save names it after its owner. The header already
		// carries it, and leaves it out for our own.
		profileId: chrome?.header.profileId ?? null,
		...(video.mimeType === undefined || video.mimeType === null
			? {}
			: { mimeType: video.mimeType }),
	};
	// Saving moves into the chrome's sender row wherever the chrome is mounted —
	// it hides the toolbar the download button would otherwise sit on.
	const actions: MediaViewerActions | undefined =
		chrome === undefined
			? undefined
			: { ...chrome.actions, onSave: () => downloadMedia(target) };
	const { default: PhotoSwipeLightboxCtor } =
		await import("photoswipe/lightbox");
	const lightbox: PhotoSwipeLightbox = new PhotoSwipeLightboxCtor({
		showHideAnimationType: "fade",
		pswpModule: () => import("photoswipe"),
		mainClass: `pswp--buttons-visible`,
		// The clip fills the screen instead of letting the conversation show
		// through a translucent backdrop.
		bgOpacity: 1,
		// One slide: there is no position to report.
		counter: false,
		// Only the bare viewer pads: the chrome's bars sit over the video.
		paddingFn: () =>
			actions === undefined
				? { top: TOOLBAR_INSET, bottom: 0, left: 0, right: 0 }
				: { top: 0, bottom: 0, left: 0, right: 0 },
	});
	lightbox.addFilter("numItems", () => 1);
	lightbox.addFilter("itemData", () => ({
		src: video.url,
		...viewportSize(),
	}));
	// Re-measures once the opening animation lands, so a viewer opened while the
	// keyboard was up centres on the screen it actually got.
	applyPhotoSwipeViewportSync(lightbox);
	applyPhotoSwipeErrorUi(lightbox);
	// The slide is handed to the custom player, which draws its own controls in
	// place of PhotoSwipe's image content.
	applyPhotoSwipeVideo(lightbox, (index) =>
		index === 0
			? { src: video.url, poster: null, loop: video.looping === true }
			: null,
	);
	applyPhotoSwipeBackGesture(lightbox);
	if (actions === undefined || chrome === undefined) {
		registerLightboxDownloadButton(lightbox, () => target);
	} else {
		registerMediaViewerChrome(lightbox, {
			count: 1,
			header: chrome.header,
			actions,
			// One slide: a progress bar over it would only ever be full.
			progress: false,
		});
	}
	if (onClosed) {
		lightbox.on("closingAnimationEnd", onClosed);
	}
	lightbox.init();
	lightbox.loadAndOpen(0);
	return () => lightbox.destroy();
}
