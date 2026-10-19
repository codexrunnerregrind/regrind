import { invoke } from "@tauri-apps/api/core";

import {
	preferencesLoaded,
	preferencesSnapshot,
} from "$lib/app-data/preferences.svelte";
import {
	isAndroidPlatform,
	isIosPlatform,
	isMacosPlatform,
	isMobilePlatform,
} from "$lib/platform/os";

// Gesture kinds go through the native `play_haptic` command on Android and
// macOS; iOS has no such command and maps them onto tauri-plugin-haptics, which
// is only registered on mobile and also backs the impact/selection/notification
// helpers below.

export type HapticKind = "longPress" | "threshold" | "dragStart";
export type ImpactStyle = "light" | "medium" | "heavy" | "soft" | "rigid";
export type NotificationType = "success" | "warning" | "error";

const IOS_KIND_IMPACT: Record<HapticKind, ImpactStyle> = {
	longPress: "medium",
	threshold: "light",
	dragStart: "medium",
};

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
	if (isIosPlatform()) {
		plugin(({ impactFeedback }) => impactFeedback(IOS_KIND_IMPACT[kind]));
		return;
	}
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
