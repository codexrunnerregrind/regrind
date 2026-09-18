import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/platform/os", () => ({ isAndroidPlatform: () => true }));
vi.mock("@tauri-apps/plugin-notification", () => ({
	isPermissionGranted: () => Promise.resolve(false),
	requestPermission: () => Promise.resolve("denied"),
}));

import { notificationAccess } from "$lib/notifications/permission.svelte";

type BridgeState = {
	appEnabled: boolean;
	messages: boolean;
	taps: boolean;
	canPrompt: boolean;
};

const requestPermission = vi.fn();

function bridge(state: BridgeState) {
	window.__RegrindPush = {
		setPrefs: () => {},
		setActiveRoute: () => {},
		permissionState: () => JSON.stringify(state),
		requestPermission,
		openNotificationSettings: () => {},
	};
}

beforeEach(() => {
	requestPermission.mockReset();
});

afterEach(() => {
	delete window.__RegrindPush;
});

describe("notification access", () => {
	it("reads the OS state from the push bridge", async () => {
		bridge({
			appEnabled: false,
			messages: false,
			taps: false,
			canPrompt: false,
		});
		await notificationAccess.refresh();

		expect(notificationAccess.current).toMatchObject({
			loaded: true,
			enabled: false,
			canPrompt: false,
			canOpenSettings: true,
		});
		expect(notificationAccess.blocked()).toBe(true);
	});

	it("treats a muted channel as blocked on its own", async () => {
		bridge({
			appEnabled: true,
			messages: true,
			taps: false,
			canPrompt: false,
		});
		await notificationAccess.refresh();

		expect(notificationAccess.current.messages).toBe(true);
		expect(notificationAccess.current.taps).toBe(false);
		expect(notificationAccess.blocked()).toBe(true);
	});

	it("does not count a state it can still prompt for as granted", async () => {
		bridge({
			appEnabled: false,
			messages: false,
			taps: false,
			canPrompt: true,
		});
		await notificationAccess.refresh();

		expect(await notificationAccess.request()).toBe(false);
		expect(requestPermission).toHaveBeenCalledTimes(1);
	});

	it("leaves the prompt alone once Android stops honouring it", async () => {
		bridge({
			appEnabled: false,
			messages: false,
			taps: false,
			canPrompt: false,
		});
		await notificationAccess.refresh();

		expect(await notificationAccess.request()).toBe(false);
		expect(requestPermission).not.toHaveBeenCalled();
	});

	it("follows the state native pushes while the screen is open", async () => {
		bridge({
			appEnabled: false,
			messages: false,
			taps: false,
			canPrompt: false,
		});
		const stop = notificationAccess.watch();
		await Promise.resolve();

		window.dispatchEvent(
			new CustomEvent("regrind:notification-permission", {
				detail: {
					appEnabled: true,
					messages: true,
					taps: true,
					canPrompt: false,
				},
			}),
		);
		expect(notificationAccess.blocked()).toBe(false);
		stop();
	});
});
