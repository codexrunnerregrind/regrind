import {
	isPermissionGranted,
	requestPermission,
} from "@tauri-apps/plugin-notification";
import z from "zod";

import { isAndroidPlatform } from "$lib/platform/os";

// Whether the OS itself will let a notification through, as opposed to whether
// the user asked us for one. The two used to be conflated: the in-app switches
// stayed on while Android dropped every banner, and the only clue was a line in
// logcat. Android answers authoritatively through the push bridge (the FCM path
// posts natively, so the Tauri plugin's view of it is not the one that matters);
// elsewhere the plugin is all there is.

const androidStateSchema = z.object({
	appEnabled: z.boolean(),
	messages: z.boolean(),
	taps: z.boolean(),
	canPrompt: z.boolean(),
});

export type NotificationAccess = {
	/** Read at least once; until then the switches stay untouched. */
	loaded: boolean;
	/** The OS will show notifications for this app. */
	enabled: boolean;
	/** Per-category, from Android's channels. Mirrors `enabled` elsewhere. */
	messages: boolean;
	taps: boolean;
	/** A runtime prompt would still appear. */
	canPrompt: boolean;
	/** We can take the user to the OS page that fixes it. */
	canOpenSettings: boolean;
};

function bridge() {
	return isAndroidPlatform() ? window.__RegrindPush : undefined;
}

class NotificationAccessStore {
	// Only the plugin path needs this: it cannot tell "not asked yet" from
	// "refused", so a refusal is remembered here instead.
	#promptRefused = false;
	#state = $state<NotificationAccess>({
		loaded: false,
		enabled: true,
		messages: true,
		taps: true,
		canPrompt: false,
		canOpenSettings: false,
	});

	get current(): NotificationAccess {
		return this.#state;
	}

	/** Any category the OS is blocking while the user has it switched on. */
	blocked(): boolean {
		const s = this.#state;
		return s.loaded && (!s.enabled || !s.messages || !s.taps);
	}

	async refresh(): Promise<void> {
		const push = bridge();
		if (push?.permissionState) {
			try {
				const parsed = androidStateSchema.parse(
					JSON.parse(push.permissionState()),
				);
				this.#state = {
					loaded: true,
					enabled: parsed.appEnabled,
					messages: parsed.messages,
					taps: parsed.taps,
					canPrompt: parsed.canPrompt,
					canOpenSettings: true,
				};
				return;
			} catch (error) {
				console.error("[notifications] permission read failed", error);
			}
		}
		try {
			const granted = await isPermissionGranted();
			this.#state = {
				loaded: true,
				enabled: granted,
				messages: granted,
				taps: granted,
				canPrompt: !granted && !this.#promptRefused,
				canOpenSettings: false,
			};
		} catch (error) {
			console.error("[notifications] permission read failed", error);
		}
	}

	/**
	 * Ask for the grant on a user gesture. Returns whether notifications are
	 * allowed afterwards; a false with `canOpenSettings` means the system
	 * settings are the only way left.
	 */
	async request(): Promise<boolean> {
		const push = bridge();
		if (push?.requestPermission) {
			if (!this.#state.canPrompt) return this.#state.enabled;
			// Native answers through `regrind:notification-permission`, which
			// also fires on the way back from the settings app; the prompt's
			// result lands there rather than in a return value.
			push.requestPermission();
			return false;
		}
		try {
			const result = await requestPermission();
			if (result !== "granted") this.#promptRefused = true;
			await this.refresh();
			return result === "granted";
		} catch (error) {
			console.error("[notifications] permission request failed", error);
			return false;
		}
	}

	openSettings(): void {
		bridge()?.openNotificationSettings?.();
	}

	/** Keep the state current: native pushes changes, and a return from the settings app is a visibility change. */
	watch(): () => void {
		void this.refresh();
		const onNative = (event: Event) => {
			const detail = (event as CustomEvent<unknown>).detail;
			const parsed = androidStateSchema.safeParse(detail);
			if (!parsed.success) return;
			this.#state = {
				loaded: true,
				enabled: parsed.data.appEnabled,
				messages: parsed.data.messages,
				taps: parsed.data.taps,
				canPrompt: parsed.data.canPrompt,
				canOpenSettings: true,
			};
		};
		const onVisible = () => {
			if (document.visibilityState === "visible") void this.refresh();
		};
		window.addEventListener("regrind:notification-permission", onNative);
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			window.removeEventListener(
				"regrind:notification-permission",
				onNative,
			);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}
}

export const notificationAccess = new NotificationAccessStore();
