import { toast } from "svelte-sonner";
import type PhotoSwipeLightbox from "photoswipe/lightbox";

import { showErrorToast } from "$lib/api/error-toast";
import {
	type MediaToSave,
	saveAllMediaToDevice,
	saveMediaToDevice,
	type SaveResult,
} from "$lib/platform/save-media";

// A download-to-tray glyph. Explicit white fill (CSS var() isn't resolved inside
// SVG presentation attributes) so it matches the built-in close/zoom buttons
// instead of inheriting the dark `currentColor` PhotoSwipe puts on `.pswp__icn`.
const DOWNLOAD_ICON = `
<svg class="pswp__icn" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
	<path fill="#fff" d="M16 4a1 1 0 0 1 1 1v11.59l3.3-3.3a1 1 0 0 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 0 1 1.4-1.42l3.3 3.3V5a1 1 0 0 1 1-1Zm-9 17a1 1 0 0 1 1 1v3h16v-3a1 1 0 1 1 2 0v4a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Z"/>
</svg>`;

export type DownloadTarget = MediaToSave;

/** A button on the success toast, e.g. "Save all" after saving one of a set. */
export type SaveFollowUp = { label: string; onClick: () => void };

// `shareFromGesture` is not a failure: the media is downloaded and only needs a
// fresh tap, so it is offered as a button rather than reported as an error.
function reportSave(
	result: SaveResult,
	toastId: string | number,
	followUp?: SaveFollowUp,
): void {
	const shareAgain = result.shareFromGesture;
	if (shareAgain !== undefined) {
		toast.info("Ready to save", {
			id: toastId,
			description: "Tap to choose where it goes.",
			// Waits for the tap rather than expiring with the media unsaved.
			duration: Infinity,
			action: {
				label: "Save",
				onClick: () => {
					const next = toast.loading("Saving…");
					shareAgain()
						.then((again) => reportSave(again, next, followUp))
						.catch((error: unknown) =>
							reportSaveError(error, next),
						);
				},
			},
		});
		return;
	}
	if (result.cancelled) {
		toast.dismiss(toastId);
		return;
	}
	if (result.saved === 0) {
		toast.error("Failed to save media", { id: toastId });
		return;
	}
	const label =
		result.saved === 1
			? "Saved to your device"
			: `Saved ${result.saved} items to your device`;
	if (result.failed > 0) {
		toast.warning(`${label} — ${result.failed} failed`, { id: toastId });
	} else {
		toast.success(label, {
			id: toastId,
			...(followUp === undefined ? {} : { action: followUp }),
		});
	}
}

// Via showErrorToast so the real reason is available as "Copy details".
function reportSaveError(error: unknown, toastId: string | number): void {
	console.error(error);
	toast.dismiss(toastId);
	showErrorToast({ label: "Failed to save media", error });
}

/**
 * Saves media to the device, reporting progress in one toast. Shared by the
 * built-in toolbar button below and the media viewer's own save control, so a
 * download behaves the same wherever it was started from.
 */
export function downloadMedia(
	target: DownloadTarget,
	followUp?: SaveFollowUp,
): void {
	const toastId = toast.loading("Downloading…");
	saveMediaToDevice(target)
		.then((result) => reportSave(result, toastId, followUp))
		.catch((error: unknown) => reportSaveError(error, toastId));
}

/** Offers the rest of a set on the toast for the one just saved. */
export function saveRestFollowUp(
	targets: DownloadTarget[],
	savedIndex: number,
): SaveFollowUp {
	const rest = targets.filter((_, index) => index !== savedIndex);
	return {
		label: `Save ${rest.length} more`,
		onClick: () => void downloadAllMedia(rest),
	};
}

/** Saves a whole set, reporting progress in one toast. */
export async function downloadAllMedia(
	targets: DownloadTarget[],
): Promise<void> {
	if (targets.length === 0) return;
	const total = targets.length;
	const toastId = toast.loading(`Saving 0 of ${total}…`);
	try {
		const result = await saveAllMediaToDevice(targets, (done) => {
			// The last is followed by the sheet or the summary.
			if (done < total) {
				toast.loading(`Saving ${done} of ${total}…`, { id: toastId });
			}
		});
		reportSave(result, toastId);
	} catch (error) {
		reportSaveError(error, toastId);
	}
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
