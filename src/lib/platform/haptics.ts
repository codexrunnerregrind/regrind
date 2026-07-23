import { isTauri } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";

/**
 * Thin, safe wrapper around @tauri-apps/plugin-haptics. The plugin is only
 * registered on iOS/Android (see src-tauri/src/lib.rs), so every call is a
 * no-op elsewhere and failures are swallowed — callers can fire-and-forget
 * without guarding for platform or availability.
 */

export type ImpactStyle = "light" | "medium" | "heavy" | "soft" | "rigid";
export type NotificationType = "success" | "warning" | "error";

function isMobile(): boolean {
	try {
		return isTauri() && (platform() === "ios" || platform() === "android");
	} catch {
		return false;
	}
}

/** A light "tick" — ideal for discrete UI changes like switching tabs. */
export function hapticSelection(): void {
	if (!isMobile()) return;
	void import("@tauri-apps/plugin-haptics")
		.then(({ selectionFeedback }) => selectionFeedback())
		.catch(() => {});
}

/** A physical tap of the given intensity — for buttons and confirmations. */
export function hapticImpact(style: ImpactStyle = "light"): void {
	if (!isMobile()) return;
	void import("@tauri-apps/plugin-haptics")
		.then(({ impactFeedback }) => impactFeedback(style))
		.catch(() => {});
}

/** Success / warning / error patterns — for operation outcomes. */
export function hapticNotification(type: NotificationType): void {
	if (!isMobile()) return;
	void import("@tauri-apps/plugin-haptics")
		.then(({ notificationFeedback }) => notificationFeedback(type))
		.catch(() => {});
}
