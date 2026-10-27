import { encode } from "@msgpack/msgpack";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { readMock, writeMock, existsMock } = vi.hoisted(() => ({
	readMock: vi.fn(),
	writeMock: vi.fn(),
	existsMock: vi.fn(),
}));

vi.mock("$lib/app-data", () => ({
	existsAppDataFile: existsMock,
	readAppDataFile: readMock,
	removeAppDataFile: () => Promise.resolve(),
	writeAppDataFileAtomic: writeMock,
}));
vi.mock("svelte-sonner", () => ({ toast: { error: vi.fn() } }));

import { maxFilterPresets } from "$lib/model/browse/grid/filter-presets";
import { defaultFilters } from "$lib/model/browse/grid/filters";
import {
	overwriteFilterPreset,
	removeFilterPreset,
	renameFilterPreset,
	saveFilterPreset,
} from "./grid-filter-presets";
import { getGridFilterPresetsSnapshot } from "./preferences.svelte";

const online = { ...defaultFilters, isOnline: true };

beforeEach(async () => {
	existsMock.mockResolvedValue(false);
	readMock.mockResolvedValue(encode({}));
	writeMock.mockResolvedValue(undefined);
	for (const preset of getGridFilterPresetsSnapshot()) {
		await removeFilterPreset(preset.id);
	}
});

describe("grid filter presets", () => {
	it("saves the filters under a derived name", async () => {
		await saveFilterPreset(online);
		const [preset] = getGridFilterPresetsSnapshot();
		expect(preset?.name).toBe("Online");
		expect(preset?.filters).toEqual(online);
	});

	it("keeps derived names unique", async () => {
		await saveFilterPreset(online);
		await saveFilterPreset(online);
		expect(getGridFilterPresetsSnapshot().map((p) => p.name)).toEqual([
			"Online",
			"Online 2",
		]);
	});

	it("renames, ignoring a blank name", async () => {
		const id = await saveFilterPreset(online);
		await renameFilterPreset(id, "  ");
		expect(getGridFilterPresetsSnapshot()[0]?.name).toBe("Online");
		await renameFilterPreset(id, " Late night ");
		expect(getGridFilterPresetsSnapshot()[0]?.name).toBe("Late night");
	});

	it("overwrites the filters but keeps the name", async () => {
		const id = await saveFilterPreset(online);
		const fresh = { ...defaultFilters, isFresh: true };
		await overwriteFilterPreset(id, fresh);
		const [preset] = getGridFilterPresetsSnapshot();
		expect(preset?.name).toBe("Online");
		expect(preset?.filters).toEqual(fresh);
	});

	it("refuses to save past the cap", async () => {
		for (let i = 0; i < maxFilterPresets; i++) {
			await saveFilterPreset(online);
		}
		await expect(saveFilterPreset(online)).rejects.toThrow();
	});
});
