import { SvelteSet } from "svelte/reactivity";

import { showErrorToast } from "$lib/api/error-toast";
import {
	preferencesLoaded,
	preferencesSnapshot,
	setPreferences,
} from "$lib/app-data/preferences.svelte";

// A failed disk write must never uncover media that was just hidden.
export const imagePrivacy = $state<{ override: true | null; pending: boolean }>(
	{ override: null, pending: false },
);

// Images revealed one by one, by source; forgotten whenever privacy turns on.
export const revealedImages = new SvelteSet<string>();

export function privacyFeatureOn(): boolean {
	const { privacyMode, discreetImages } = preferencesSnapshot();
	return privacyMode ?? discreetImages;
}

export function imagesHidden(): boolean {
	return (
		!preferencesLoaded() ||
		imagePrivacy.override === true ||
		(privacyFeatureOn() && preferencesSnapshot().discreetImages)
	);
}

export function toggleImagePrivacy(): Promise<void> {
	if (!privacyFeatureOn()) return Promise.resolve();
	return setImagePrivacy(
		!(imagePrivacy.override ?? preferencesSnapshot().discreetImages),
	);
}

/** Turns the feature itself on (hiding at once) or off (showing everything). */
export function setPrivacyFeature(on: boolean): Promise<void> {
	return save({ privacyMode: on, discreetImages: on }, on);
}

export function setImagePrivacy(next: boolean): Promise<void> {
	return save({ discreetImages: next }, next);
}

async function save(
	values: { privacyMode?: boolean; discreetImages: boolean },
	next: boolean,
): Promise<void> {
	if (imagePrivacy.pending) return;
	imagePrivacy.pending = true;
	if (next) {
		imagePrivacy.override = true;
		revealedImages.clear();
	}
	try {
		await setPreferences(values);
		imagePrivacy.override = null;
	} catch (error) {
		showErrorToast({ label: "Couldn't save image privacy setting", error });
	} finally {
		imagePrivacy.pending = false;
	}
}
