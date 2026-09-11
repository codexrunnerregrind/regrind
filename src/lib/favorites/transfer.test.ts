import { describe, expect, it } from "vitest";

import {
	buildFavoritesExport,
	favoritesExportFilename,
	FavoritesImportError,
	parseFavoritesExport,
	serializeFavoritesExport,
} from "./transfer";

const entry = {
	profileId: 42,
	displayName: "Alex",
	profileImageMediaHash: "hash",
	notes: "met at the gym",
	phoneNumber: "+351 000",
};

describe("favoritesExportFilename", () => {
	it("stamps the day", () => {
		expect(favoritesExportFilename(new Date("2026-09-11T13:05:00Z"))).toBe(
			"regrind-favorites-2026-09-11.json",
		);
	});
});

describe("buildFavoritesExport", () => {
	it("keeps the note and drops what only the preview needed", () => {
		const data = buildFavoritesExport([entry]);
		expect(data.favorites).toEqual([
			{
				profileId: 42,
				displayName: "Alex",
				notes: "met at the gym",
				phoneNumber: "+351 000",
			},
		]);
	});

	it("round-trips through the file", () => {
		const data = buildFavoritesExport([entry]);
		expect(parseFavoritesExport(serializeFavoritesExport(data))).toEqual(
			data,
		);
	});
});

describe("parseFavoritesExport", () => {
	it("rejects a file that isn't JSON", () => {
		expect(() => parseFavoritesExport("nope")).toThrow(
			FavoritesImportError,
		);
	});

	it("rejects an unrelated JSON file", () => {
		expect(() => parseFavoritesExport('{"favorites":[]}')).toThrow(
			FavoritesImportError,
		);
	});

	it("rejects a newer file rather than dropping what it doesn't know", () => {
		const text = JSON.stringify({
			kind: "regrind-favorites",
			version: 2,
			exportedAt: "2026-09-11T00:00:00.000Z",
			favorites: [],
		});
		expect(() => parseFavoritesExport(text)).toThrow(FavoritesImportError);
	});

	it("fills in a missing note", () => {
		const text = JSON.stringify({
			kind: "regrind-favorites",
			version: 1,
			exportedAt: "2026-09-11T00:00:00.000Z",
			favorites: [{ profileId: 7 }],
		});
		expect(parseFavoritesExport(text).favorites[0]).toEqual({
			profileId: 7,
			notes: "",
			phoneNumber: "",
		});
	});
});
