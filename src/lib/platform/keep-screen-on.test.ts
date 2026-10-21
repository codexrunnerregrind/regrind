import { encode } from "@msgpack/msgpack";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, readMock } = vi.hoisted(() => ({
	invokeMock: vi.fn(),
	readMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
}));
vi.mock("$lib/app-data", () => ({
	existsAppDataFile: () => Promise.resolve(true),
	readAppDataFile: readMock,
	removeAppDataFile: () => Promise.resolve(),
	writeAppDataFileAtomic: () => Promise.resolve(),
}));

import { setPreferences } from "$lib/app-data/preferences.svelte";
import {
	applyKeepScreenOn,
	keepScreenOnAvailable,
} from "$lib/platform/keep-screen-on";

const tauri = globalThis as {
	isTauri?: boolean;
	__TAURI_OS_PLUGIN_INTERNALS__?: { platform: string };
};

function runningOn(platform: string) {
	tauri.isTauri = true;
	tauri.__TAURI_OS_PLUGIN_INTERNALS__ = { platform };
}

beforeEach(async () => {
	invokeMock.mockReset().mockResolvedValue(undefined);
	readMock.mockReset().mockResolvedValue(encode({}));
	await setPreferences({ keepScreenOn: false });
});

afterEach(() => {
	delete tauri.isTauri;
	delete tauri.__TAURI_OS_PLUGIN_INTERNALS__;
});

describe("keepScreenOnAvailable", () => {
	it("is true only on phones", () => {
		runningOn("ios");
		expect(keepScreenOnAvailable()).toBe(true);
		runningOn("android");
		expect(keepScreenOnAvailable()).toBe(true);
		runningOn("macos");
		expect(keepScreenOnAvailable()).toBe(false);
	});
});

describe("applyKeepScreenOn", () => {
	it("sends the preference to the backend on a phone", async () => {
		runningOn("ios");
		await setPreferences({ keepScreenOn: true });

		applyKeepScreenOn();

		expect(invokeMock).toHaveBeenCalledExactlyOnceWith(
			"set_keep_screen_on",
			{ enabled: true },
		);
	});

	it("does nothing on desktop", () => {
		runningOn("linux");

		applyKeepScreenOn();

		expect(invokeMock).not.toHaveBeenCalled();
	});
});
