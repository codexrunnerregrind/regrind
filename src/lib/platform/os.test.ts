import { afterEach, describe, expect, it } from "vitest";

import {
	currentPlatform,
	isAndroidPlatform,
	isDesktopPlatform,
	isIosPlatform,
	isLinuxPlatform,
	isMacosPlatform,
	isMobilePlatform,
	type SupportedPlatform,
} from "#lib/platform/os.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";

const families = {
	android: "mobile",
	ios: "mobile",
	linux: "desktop",
	macos: "desktop",
	windows: "desktop",
} as const satisfies Record<SupportedPlatform, "mobile" | "desktop">;

const platforms = Object.keys(families) as SupportedPlatform[];

afterEach(resetPlatform);

describe("isAndroidPlatform", () => {
	it("is false outside Tauri instead of reading the missing os plugin", () => {
		expect(isAndroidPlatform()).toBe(false);
	});

	it("distinguishes android from the other mobile platform", () => {
		runningOn("android");
		expect(isAndroidPlatform()).toBe(true);

		runningOn("ios");
		expect(isAndroidPlatform()).toBe(false);
	});
});

describe("isIosPlatform", () => {
	it("is false outside Tauri instead of reading the missing os plugin", () => {
		expect(isIosPlatform()).toBe(false);
	});

	it("distinguishes ios from the other mobile platform", () => {
		runningOn("ios");
		expect(isIosPlatform()).toBe(true);

		runningOn("android");
		expect(isIosPlatform()).toBe(false);
	});
});

describe("isLinuxPlatform", () => {
	it("is false outside Tauri instead of reading the missing os plugin", () => {
		expect(isLinuxPlatform()).toBe(false);
	});

	it("is true only on linux", () => {
		runningOn("linux");
		expect(isLinuxPlatform()).toBe(true);

		runningOn("android");
		expect(isLinuxPlatform()).toBe(false);
	});
});

describe("isMacosPlatform", () => {
	it("is false outside Tauri instead of reading the missing os plugin", () => {
		expect(isMacosPlatform()).toBe(false);
	});

	it("is true only on macos", () => {
		runningOn("macos");
		expect(isMacosPlatform()).toBe(true);

		runningOn("ios");
		expect(isMacosPlatform()).toBe(false);
	});
});

describe("currentPlatform", () => {
	it.each(platforms)("reports %s", (platform) => {
		runningOn(platform);
		expect(currentPlatform()).toBe(platform);
	});

	it.each(["dragonfly", "freebsd", "netbsd", "openbsd", "solaris"])(
		"refuses %s, which ReGrind does not build for",
		(host) => {
			Object.assign(globalThis, {
				__TAURI_OS_PLUGIN_INTERNALS__: { platform: host },
			});
			expect(currentPlatform).toThrow(`ReGrind does not support ${host}`);
		},
	);
});

describe("without the Tauri os plugin", () => {
	it("currentPlatform throws instead of guessing a platform", () => {
		resetPlatform();
		expect(currentPlatform).toThrow(TypeError);
	});

	it.each([isMobilePlatform, isDesktopPlatform])(
		"%o is false instead of reading the missing os plugin",
		(helper) => {
			resetPlatform();
			expect(helper()).toBe(false);
		},
	);
});

describe("isMobilePlatform and isDesktopPlatform", () => {
	it.each(platforms)("put %s in exactly one family", (platform) => {
		runningOn(platform);
		expect(isMobilePlatform()).toBe(families[platform] === "mobile");
		expect(isDesktopPlatform()).toBe(families[platform] === "desktop");
	});
});
