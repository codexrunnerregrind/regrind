import { isTauri } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";

import { getPreferencesSnapshot } from "$lib/app-data/preferences.svelte";

/**
 * Thin, safe wrapper around @tauri-apps/plugin-haptics. The plugin is only
 * registered on iOS/Android (see src-tauri/src/lib.rs), so every call is a
 * no-op elsewhere and failures are swallowed — callers can fire-and-forget
 * without guarding for platform or availability.
 */

export type ImpactStyle = "light" | "medium" | "heavy" | "soft" | "rigid";
export type NotificationType = "success" | "warning" | "error";

/** Whether this device can vibrate at all — the settings toggle hides itself
 *  where it cannot. */
export function hapticsAvailable(): boolean {
	try {
		return isTauri() && (platform() === "ios" || platform() === "android");
	} catch {
		return false;
	}
}

// Every entry point goes through this, so the preference governs the whole app
// rather than one gesture.
function enabled(): boolean {
	return hapticsAvailable() && getPreferencesSnapshot().hapticFeedback;
}

/** A light "tick" — ideal for discrete UI changes like switching tabs. */
export function hapticSelection(): void {
	if (!enabled()) return;
	void import("@tauri-apps/plugin-haptics")
		.then(({ selectionFeedback }) => selectionFeedback())
		.catch(() => {});
}

/** A physical tap of the given intensity — for buttons and confirmations. */
export function hapticImpact(style: ImpactStyle = "light"): void {
	if (!enabled()) return;
	void import("@tauri-apps/plugin-haptics")
		.then(({ impactFeedback }) => impactFeedback(style))
		.catch(() => {});
}

/** Success / warning / error patterns — for operation outcomes. */
export function hapticNotification(type: NotificationType): void {
	if (!enabled()) return;
	void import("@tauri-apps/plugin-haptics")
		.then(({ notificationFeedback }) => notificationFeedback(type))
		.catch(() => {});
}
