import { toast } from "svelte-sonner";

import { showErrorToast } from "$lib/api/error-toast";
import type { SaveFileResult } from "$lib/platform/data-file";

/**
 * Settles a "Saving…" toast. iOS may need a fresh tap before the share sheet
 * opens, so that case becomes a button rather than an error.
 */
export function reportSaved(
	result: SaveFileResult,
	{
		toastId,
		success,
		errorLabel,
	}: { toastId: string | number; success: string; errorLabel: string },
): void {
	const shareAgain = result.shareFromGesture;
	if (shareAgain !== undefined) {
		toast.info("Ready to save", {
			id: toastId,
			description: "Tap to choose where it goes.",
			duration: Infinity,
			action: {
				label: "Save",
				onClick: () => {
					const next = toast.loading("Saving…");
					shareAgain()
						.then((again) => {
							reportSaved(again, {
								toastId: next,
								success,
								errorLabel,
							});
						})
						.catch((caught: unknown) => {
							toast.dismiss(next);
							showErrorToast({
								label: errorLabel,
								error: caught,
							});
						});
				},
			},
		});
		return;
	}
	if (result.cancelled) {
		toast.dismiss(toastId);
		return;
	}
	toast.success(success, { id: toastId });
}
