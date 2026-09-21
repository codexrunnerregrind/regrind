import { describe, expect, it, vi } from "vitest";

async function loadWith(store: string | undefined) {
	vi.stubEnv("OPEN_GRIND_STORE", store);
	vi.resetModules();
	const { isPlayBuild } = await import("./store");
	return isPlayBuild();
}

describe("isPlayBuild", () => {
	it("is true only for the play store build", async () => {
		expect(await loadWith("play")).toBe(true);
	});

	it("is false for a release build, which carries no store", async () => {
		expect(await loadWith(undefined)).toBe(false);
	});

	it("is false for any other store value", async () => {
		expect(await loadWith("fdroid")).toBe(false);
	});
});
