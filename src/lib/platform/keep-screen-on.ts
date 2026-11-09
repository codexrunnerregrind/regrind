import { invoke } from "@tauri-apps/api/core";

import {
	preferencesLoaded,
	preferencesSnapshot,
} from "#lib/app-data/preferences.svelte.ts";
import { isMobilePlatform } from "#lib/platform/os.ts";

export function keepScreenOnAvailable(): boolean {
	return isMobilePlatform();
}

/** Call inside an `$effect` so it follows the preference. */
export function applyKeepScreenOn(): void {
	if (!keepScreenOnAvailable() || !preferencesLoaded()) return;
	const enabled = preferencesSnapshot().keepScreenOn;
	void invoke("set_keep_screen_on", { enabled }).catch(console.error);
}
