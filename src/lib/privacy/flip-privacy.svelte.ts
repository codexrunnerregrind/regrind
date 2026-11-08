import { invoke } from "@tauri-apps/api/core";

import { showErrorToast } from "$lib/api/error-toast";
import { preferencesLoaded } from "$lib/app-data/preferences.svelte";
import { isIosPlatform } from "$lib/platform/os";
import { privacyFeatureOn, toggleImagePrivacy } from "./image-privacy.svelte";

// Preserve native start/stop ordering across rapid preference changes.
let nativeQueue: Promise<unknown> = Promise.resolve();
function setNativeEnabled(enabled: boolean): Promise<unknown> {
	const next = nativeQueue.then(() =>
		invoke("set_flip_privacy", { enabled }),
	);
	nativeQueue = next.catch(() => undefined);
	return next;
}

/** Reactive effect: the flip shortcut controls the same mode as the settings switch. */
export function listenForPrivacyFlips(): (() => void) | undefined {
	if (!isIosPlatform() || !preferencesLoaded() || !privacyFeatureOn()) return;
	let active = true;
	const flip = () => {
		if (active && document.visibilityState === "visible")
			void toggleImagePrivacy();
	};
	window.addEventListener("regrind-flip-privacy", flip);
	void setNativeEnabled(true).catch((error) => {
		if (active)
			showErrorToast({ label: "Couldn't enable flip gesture", error });
	});
	return () => {
		active = false;
		window.removeEventListener("regrind-flip-privacy", flip);
		// Serialize cleanup after startup so a quick preference change cannot
		// leave the native observer running after this effect has gone away.
		void setNativeEnabled(false).catch(console.error);
	};
}
