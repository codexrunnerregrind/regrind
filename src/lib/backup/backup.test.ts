import { encode } from "@msgpack/msgpack";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/app-data", () => ({
	existsAppDataFile: () => Promise.resolve(false),
	readAppDataFile: () => Promise.resolve(encode({})),
	removeAppDataFile: () => Promise.resolve(),
	writeAppDataFileAtomic: () => Promise.resolve(),
}));
vi.mock("svelte-sonner", () => ({ toast: { error: vi.fn() } }));

import {
	getPreferences,
	readPortablePreferences,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import {
	BackupReadError,
	backupSettingsCount,
	buildBackup,
	parseBackup,
	restoreBackup,
	serializeBackup,
} from "./backup";

const madrid = {
	id: "a",
	name: "Madrid",
	lat: 40.4227,
	lon: -3.6976,
	favorite: true,
	usedAt: 1,
};
const lisbon = {
	...madrid,
	id: "b",
	name: "Lisbon",
	lat: 38.7223,
	lon: -9.1393,
};

beforeEach(async () => {
	await setPreferences({
		savedLocations: [],
		themeMode: "dark",
		units: "metric",
	});
});

describe("backup", () => {
	it("carries places and portable settings only", async () => {
		const backup = buildBackup({
			preferences: {
				...(await getPreferences()),
				savedLocations: [madrid],
				themeMode: "light",
				geohash: "u4pruydq",
				onboardingComplete: true,
			},
		});
		expect(backup).not.toHaveProperty("favorites");
		expect(backup.places.map((place) => place.name)).toEqual(["Madrid"]);
		expect(backup.settings).toMatchObject({ themeMode: "light" });
		for (const key of ["geohash", "onboardingComplete", "savedLocations"]) {
			expect(backup.settings).not.toHaveProperty(key);
		}
		expect(parseBackup(serializeBackup(backup))).toEqual(backup);
	});

	it("leaves out the parts that weren't picked", async () => {
		const backup = buildBackup({
			preferences: {
				...(await getPreferences()),
				savedLocations: [madrid],
			},
			parts: { places: true, settings: false },
		});
		expect(backup.places).toHaveLength(1);
		expect(backup.settings).toEqual({});
	});

	it("reads a saved places export as a places-only backup", () => {
		const backup = parseBackup(
			JSON.stringify({
				kind: "regrind-saved-places",
				version: 1,
				exportedAt: "2026-10-29T00:00:00.000Z",
				// No `favorite` flag: written before history was exported.
				places: [{ name: "Porto", lat: 41.1579, lon: -8.6291 }],
			}),
		);
		expect(backup.places).toEqual([
			{ name: "Porto", lat: 41.1579, lon: -8.6291, favorite: true },
		]);
		expect(backupSettingsCount(backup)).toBe(0);
	});

	it("rejects invalid, foreign and newer files", () => {
		expect(() => parseBackup("nope")).toThrow(BackupReadError);
		expect(() => parseBackup('{"kind":"regrind-favorites"}')).toThrow(
			BackupReadError,
		);
		expect(() =>
			parseBackup(
				JSON.stringify({
					kind: "regrind-backup",
					version: 99,
					exportedAt: "",
				}),
			),
		).toThrow(/newer version/);
	});

	it("reads settings field by field, dropping unknown and invalid ones", () => {
		expect(
			readPortablePreferences({
				themeMode: "light",
				units: "furlongs",
				geohash: "u4pruydq",
				madeUp: true,
			}),
		).toEqual({ themeMode: "light" });
	});

	it("restores the settings and only the places picked", async () => {
		const backup = buildBackup({
			preferences: {
				...(await getPreferences()),
				savedLocations: [madrid, lisbon],
				themeMode: "light",
			},
		});
		const result = await restoreBackup(backup, {
			settings: true,
			places: backup.places.filter((place) => place.name === "Lisbon"),
		});
		const after = await getPreferences();
		expect(after.themeMode).toBe("light");
		expect(after.savedLocations.map((place) => place.name)).toEqual([
			"Lisbon",
		]);
		expect(result.places).toMatchObject({ added: 1 });
	});

	it("keeps settings when they aren't picked", async () => {
		const backup = buildBackup({
			preferences: { ...(await getPreferences()), themeMode: "light" },
		});
		const result = await restoreBackup(backup, {
			settings: false,
			places: [],
		});
		expect((await getPreferences()).themeMode).toBe("dark");
		expect(result).toEqual({ settings: 0, places: null });
	});
});
