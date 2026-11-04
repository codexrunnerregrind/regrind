import { showErrorToast } from "$lib/api/error-toast";
import {
	preferencesSnapshot,
	setPreferences,
} from "$lib/app-data/preferences.svelte";

// A failed disk write must never uncover media that was just hidden.
export const imagePrivacy = $state<{ override: true | null; pending: boolean }>(
	{ override: null, pending: false },
);

export function toggleImagePrivacy(): Promise<void> {
	return setImagePrivacy(
		!(imagePrivacy.override ?? preferencesSnapshot().discreetImages),
	);
}

export async function setImagePrivacy(next: boolean): Promise<void> {
	if (imagePrivacy.pending) return;
	imagePrivacy.pending = true;
	if (next) imagePrivacy.override = true;
	try {
		await setPreferences({ discreetImages: next });
		imagePrivacy.override = null;
	} catch (error) {
		showErrorToast({ label: "Couldn't save image privacy setting", error });
	} finally {
		imagePrivacy.pending = false;
	}
}
