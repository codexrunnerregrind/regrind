import { encode } from "@msgpack/msgpack";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { importFavoritesMock } = vi.hoisted(() => ({
	importFavoritesMock: vi.fn(),
}));

vi.mock("$lib/app-data", () => ({
	existsAppDataFile: () => Promise.resolve(false),
	readAppDataFile: () => Promise.resolve(encode({})),
	removeAppDataFile: () => Promise.resolve(),
	writeAppDataFileAtomic: () => Promise.resolve(),
}));
vi.mock("svelte-sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("$lib/favorites/transfer", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/favorites/transfer")>()),
	importFavorites: importFavoritesMock,
}));

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
const friend = {
	profileId: 7,
	displayName: "Friend",
	profileImageMediaHash: null,
	notes: "met at the gym",
	phoneNumber: "",
};

beforeEach(async () => {
	importFavoritesMock
		.mockReset()
		.mockResolvedValue({ added: 1, failed: 0, notesFailed: 0 });
	await setPreferences({
		savedLocations: [],
		themeMode: "dark",
		units: "metric",
	});
});

describe("backup", () => {
	it("carries favorites, places and portable settings only", async () => {
		const preferences = {
			...(await getPreferences()),
			savedLocations: [madrid],
			themeMode: "light" as const,
			geohash: "u4pruydq",
			onboardingComplete: true,
		};
		const backup = buildBackup({ favorites: [friend], preferences });
		expect(backup.favorites).toEqual([
			{
				profileId: 7,
				displayName: "Friend",
				notes: "met at the gym",
				phoneNumber: "",
			},
		]);
		expect(backup.places.map((place) => place.name)).toEqual(["Madrid"]);
		expect(backup.settings).toMatchObject({ themeMode: "light" });
		for (const key of ["geohash", "onboardingComplete", "savedLocations"]) {
			expect(backup.settings).not.toHaveProperty(key);
		}
		expect(parseBackup(serializeBackup(backup))).toEqual(backup);
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

	it("restores only the parts that were picked", async () => {
		const backup = parseBackup(
			serializeBackup(
				buildBackup({
					favorites: [friend],
					preferences: {
						...(await getPreferences()),
						savedLocations: [madrid],
						themeMode: "light",
					},
				}),
			),
		);
		expect(backupSettingsCount(backup)).toBeGreaterThan(0);

		const result = await restoreBackup(backup, {
			favorites: false,
			places: true,
			settings: true,
		});
		const after = await getPreferences();
		expect(after.themeMode).toBe("light");
		expect(after.savedLocations.map((place) => place.name)).toEqual([
			"Madrid",
		]);
		expect(result.places).toMatchObject({ added: 1 });
		expect(result.favorites).toBeNull();
		expect(importFavoritesMock).not.toHaveBeenCalled();

		await restoreBackup(backup, {
			favorites: true,
			places: false,
			settings: false,
		});
		expect(importFavoritesMock).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					profileId: 7,
					notes: "met at the gym",
				}),
			],
			undefined,
		);
	});
});
