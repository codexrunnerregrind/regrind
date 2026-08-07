import { toast } from "svelte-sonner";
import type PhotoSwipeLightbox from "photoswipe/lightbox";

import { saveMediaToDevice } from "$lib/platform/save-media";

// A download-to-tray glyph. Explicit white fill (CSS var() isn't resolved inside
// SVG presentation attributes) so it matches the built-in close/zoom buttons
// instead of inheriting the dark `currentColor` PhotoSwipe puts on `.pswp__icn`.
const DOWNLOAD_ICON = `
<svg class="pswp__icn" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
	<path fill="#fff" d="M16 4a1 1 0 0 1 1 1v11.59l3.3-3.3a1 1 0 0 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 0 1 1.4-1.42l3.3 3.3V5a1 1 0 0 1 1-1Zm-9 17a1 1 0 0 1 1 1v3h16v-3a1 1 0 1 1 2 0v4a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Z"/>
</svg>`;

export type DownloadTarget = { url: string; mimeType?: string };

/**
 * Saves media to the device, reporting progress in one toast. Shared by the
 * built-in toolbar button below and the media viewer's own save control, so a
 * download behaves the same wherever it was started from.
 */
export function downloadMedia(target: DownloadTarget): void {
	const toastId = toast.loading("Downloading…");
	saveMediaToDevice(target.url, target.mimeType)
		.then((saved) => {
			if (saved) {
				toast.success("Saved to your device", { id: toastId });
			} else {
				toast.dismiss(toastId);
			}
		})
		.catch((error) => {
			console.error(error);
			toast.error("Failed to save media", { id: toastId });
		});
}

// Adds a "Download" button to a PhotoSwipe lightbox's top toolbar. `resolve`
// maps the currently-viewed slide index to the media to save, or `null` to skip
// (e.g. a locked slide).
//
// Only for viewers without the story chrome: that hides the toolbar and carries
// its own save control, wired to `downloadMedia` above.
export function registerLightboxDownloadButton(
	lightbox: PhotoSwipeLightbox,
	resolve: (index: number) => DownloadTarget | null,
): void {
	lightbox.on("uiRegister", () => {
		lightbox.pswp?.ui?.registerElement({
			name: "download-button",
			// Between PhotoSwipe's own zoom (10) and close (20), so every viewer
			// reads zoom, download, close.
			order: 15,
			isButton: true,
			tagName: "button",
			title: "Download",
			html: DOWNLOAD_ICON,
			onClick: () => {
				const index = lightbox.pswp?.currIndex;
				if (index === undefined) return;
				const target = resolve(index);
				if (!target) return;
				downloadMedia(target);
			},
		});
	});
}
