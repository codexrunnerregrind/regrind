import { invoke } from "@tauri-apps/api/core";

import {
	preferencesLoaded,
	preferencesSnapshot,
} from "#lib/app-data/preferences.svelte.ts";
import {
	isAndroidPlatform,
	isIosPlatform,
	isMacosPlatform,
	isMobilePlatform,
} from "#lib/platform/os.ts";

// Gesture kinds go through the native `play_haptic` command; tauri-plugin-haptics
// (mobile only) backs the impact/selection/notification helpers below.

export type HapticKind = "longPress" | "threshold" | "dragStart";
export type ImpactStyle = "light" | "medium" | "heavy" | "soft" | "rigid";
export type NotificationType = "success" | "warning" | "error";

export function hapticsAvailable(): boolean {
	return isAndroidPlatform() || isIosPlatform() || isMacosPlatform();
}

function enabled(): boolean {
	return (
		hapticsAvailable() &&
		preferencesLoaded() &&
		preferencesSnapshot().hapticFeedback
	);
}

function plugin(
	play: (haptics: typeof import("@tauri-apps/plugin-haptics")) => unknown,
): void {
	if (!isMobilePlatform() || !enabled()) return;
	void import("@tauri-apps/plugin-haptics").then(play).catch(() => {});
}

export function playHaptic(kind: HapticKind): void {
	if (!enabled()) return;
	void invoke("play_haptic", { kind }).catch(console.error);
}

/** A light tick for discrete UI changes like switching tabs. */
export function hapticSelection(): void {
	plugin(({ selectionFeedback }) => selectionFeedback());
}

export function hapticImpact(style: ImpactStyle = "light"): void {
	plugin(({ impactFeedback }) => impactFeedback(style));
}

export function hapticNotification(type: NotificationType): void {
	plugin(({ notificationFeedback }) => notificationFeedback(type));
}
