// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	invoke: vi.fn().mockResolvedValue(undefined),
	toggle: vi.fn(),
	loaded: true,
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	preferencesLoaded: () => mocks.loaded,
}));
vi.mock("$lib/platform/os", () => ({ isIosPlatform: () => true }));
vi.mock("./image-privacy.svelte", () => ({ toggleImagePrivacy: mocks.toggle }));

import { listenForPrivacyFlips } from "./flip-privacy.svelte";

describe("iPhone flip privacy bridge", () => {
	let stop: (() => void) | undefined;
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.loaded = true;
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			value: "visible",
		});
	});
	afterEach(async () => {
		stop?.();
		stop = undefined;
		await vi.waitFor(() =>
			expect(mocks.invoke.mock.calls.at(-1)?.[1]).not.toEqual({
				enabled: true,
			}),
		);
	});
	it("waits for preferences to load before starting sensors", () => {
		mocks.loaded = false;
		stop = listenForPrivacyFlips();
		expect(stop).toBeUndefined();
		expect(mocks.invoke).not.toHaveBeenCalled();
	});
	it("toggles on a native flip, then removes the listener and stops sensors", async () => {
		stop = listenForPrivacyFlips();
		await vi.waitFor(() =>
			expect(mocks.invoke).toHaveBeenCalledWith("set_flip_privacy", {
				enabled: true,
			}),
		);
		window.dispatchEvent(new Event("regrind-flip-privacy"));
		expect(mocks.toggle).toHaveBeenCalledTimes(1);
		stop?.();
		stop = undefined;
		window.dispatchEvent(new Event("regrind-flip-privacy"));
		expect(mocks.toggle).toHaveBeenCalledTimes(1);
		await vi.waitFor(() =>
			expect(mocks.invoke).toHaveBeenLastCalledWith("set_flip_privacy", {
				enabled: false,
			}),
		);
	});
	it("ignores flips while the document is hidden", () => {
		stop = listenForPrivacyFlips();
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			value: "hidden",
		});
		window.dispatchEvent(new Event("regrind-flip-privacy"));
		expect(mocks.toggle).not.toHaveBeenCalled();
	});
});
