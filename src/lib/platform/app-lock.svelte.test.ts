// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	preferences: { appLock: true, appLockAfter: 60 },
	save: vi.fn(),
	authenticate: vi.fn(),
	checkStatus: vi.fn(),
	toast: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-biometric", () => ({
	authenticate: mocks.authenticate,
	checkStatus: mocks.checkStatus,
}));
vi.mock("svelte-sonner", () => ({ toast: mocks.toast }));
vi.mock("#lib/platform/os.ts", () => ({ isMobilePlatform: () => true }));
vi.mock("#lib/app-data/preferences.svelte.ts", () => ({
	preferencesLoaded: () => true,
	preferencesSnapshot: () => mocks.preferences,
	setPreferences: mocks.save,
}));

import {
	appLockCovering,
	appLocked,
	installAppLock,
	resetAppLockForTests,
	setAppLock,
	unlockApp,
} from "./app-lock.svelte.ts";

let visibility: DocumentVisibilityState = "visible";
Object.defineProperty(document, "visibilityState", { get: () => visibility });

function setVisibility(next: DocumentVisibilityState) {
	visibility = next;
	document.dispatchEvent(new Event("visibilitychange"));
}

describe("app lock", () => {
	let release: () => void;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.resetAllMocks();
		resetAppLockForTests();
		visibility = "visible";
		mocks.preferences.appLock = true;
		mocks.preferences.appLockAfter = 60;
		mocks.save.mockImplementation((values: object) => {
			Object.assign(mocks.preferences, values);
			return Promise.resolve();
		});
		mocks.checkStatus.mockResolvedValue({ isAvailable: true });
		release = installAppLock();
	});

	afterEach(() => {
		release();
		vi.useRealTimers();
	});

	it("starts locked and unlocks after the screen lock passes", async () => {
		expect(appLocked()).toBe(true);
		mocks.authenticate.mockResolvedValue(undefined);
		await unlockApp();
		expect(mocks.authenticate).toHaveBeenCalledWith(
			"Unlock ReGrind",
			expect.objectContaining({ allowDeviceCredential: true }),
		);
		expect(appLockCovering()).toBe(false);
	});

	it("stays locked when the prompt is cancelled", async () => {
		mocks.authenticate.mockRejectedValue({ code: "userCancel" });
		await unlockApp();
		expect(appLocked()).toBe(true);
		expect(mocks.save).not.toHaveBeenCalled();
	});

	it("turns itself off on a device without a screen lock", async () => {
		mocks.authenticate.mockRejectedValue("failed");
		mocks.checkStatus.mockResolvedValue({
			isAvailable: false,
			errorCode: "passcodeNotSet",
		});
		await unlockApp();
		expect(mocks.preferences.appLock).toBe(false);
		expect(appLockCovering()).toBe(false);
	});

	it("covers while away and relocks only after the delay", async () => {
		mocks.authenticate.mockResolvedValue(undefined);
		await unlockApp();

		setVisibility("hidden");
		expect(appLockCovering()).toBe(true);
		expect(appLocked()).toBe(false);
		vi.advanceTimersByTime(30_000);
		setVisibility("visible");
		expect(appLockCovering()).toBe(false);

		setVisibility("hidden");
		vi.advanceTimersByTime(60_000);
		setVisibility("visible");
		expect(appLocked()).toBe(true);
		expect(mocks.authenticate).toHaveBeenCalledTimes(2);
	});

	it("locks on leaving when set to lock now", async () => {
		mocks.preferences.appLockAfter = 0;
		mocks.authenticate.mockResolvedValue(undefined);
		await unlockApp();
		setVisibility("hidden");
		expect(appLocked()).toBe(true);
	});

	it("ignores the app hiding behind its own prompt", async () => {
		mocks.preferences.appLockAfter = 0;
		let pass = () => {};
		mocks.authenticate.mockReturnValue(
			new Promise<void>((resolve) => (pass = resolve)),
		);
		const unlocking = unlockApp();
		setVisibility("hidden");
		setVisibility("visible");
		pass();
		await unlocking;
		expect(appLocked()).toBe(false);
	});

	it("needs the screen lock to turn on", async () => {
		mocks.preferences.appLock = false;
		mocks.authenticate.mockRejectedValue({ code: "userCancel" });
		await expect(setAppLock(true)).rejects.toBeDefined();
		expect(mocks.preferences.appLock).toBe(false);

		mocks.authenticate.mockResolvedValue(undefined);
		await setAppLock(true);
		expect(mocks.preferences.appLock).toBe(true);
		expect(appLocked()).toBe(false);
	});
});
