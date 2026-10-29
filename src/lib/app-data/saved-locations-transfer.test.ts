import { describe, expect, it } from "vitest";

import {
	maxFavorites,
	maxRecents,
	type SavedLocation,
} from "$lib/model/saved-location";
import {
	buildSavedPlacesExport,
	mergeSavedPlaces,
	parseSavedPlacesExport,
	SavedPlacesImportError,
	serializeSavedPlacesExport,
} from "./saved-locations-transfer";

const madrid: SavedLocation = {
	id: "a",
	name: "Madrid",
	lat: 40.4227,
	lon: -3.6976,
	favorite: true,
	usedAt: 1,
};
const lisbon: SavedLocation = {
	id: "b",
	name: "Lisbon",
	lat: 38.7223,
	lon: -9.1393,
	favorite: false,
	usedAt: 2,
};

describe("saved places transfer", () => {
	it("exports favorites and history and round-trips", () => {
		const data = buildSavedPlacesExport([madrid, lisbon]);
		expect(data.places).toEqual([
			{
				name: "Madrid",
				lat: 40.4227,
				lon: -3.6976,
				favorite: true,
				usedAt: 1,
			},
			{
				name: "Lisbon",
				lat: 38.7223,
				lon: -9.1393,
				favorite: false,
				usedAt: 2,
			},
		]);
		expect(
			parseSavedPlacesExport(serializeSavedPlacesExport(data)),
		).toEqual(data);
	});

	it("rejects invalid, foreign and newer files", () => {
		expect(() => parseSavedPlacesExport("{")).toThrow(
			SavedPlacesImportError,
		);
		expect(() => parseSavedPlacesExport('{"kind":"other"}')).toThrow(
			SavedPlacesImportError,
		);
		const newer = { ...buildSavedPlacesExport([]), version: 99 };
		expect(() => parseSavedPlacesExport(JSON.stringify(newer))).toThrow(
			/newer version/,
		);
	});

	it("adds new places, stars matching history and keeps favorites as is", () => {
		const result = mergeSavedPlaces(
			[madrid, lisbon],
			[
				{
					name: "Renamed",
					lat: madrid.lat,
					lon: madrid.lon,
					favorite: true,
				},
				{
					name: "Lisboa",
					lat: lisbon.lat,
					lon: lisbon.lon,
					favorite: true,
				},
				{ name: "Porto", lat: 41.1579, lon: -8.6291, favorite: true },
			],
			5,
		);
		expect(result).toMatchObject({ added: 1, existing: 2, skipped: 0 });
		expect(result.locations.map((l) => [l.name, l.favorite])).toEqual([
			["Madrid", true],
			["Lisbon", true],
			["Porto", true],
		]);
		expect(result.locations[2]?.usedAt).toBe(5);
	});

	it("skips places past the favorites cap", () => {
		const full = Array.from({ length: maxFavorites }, (_, i) => ({
			...madrid,
			id: `${i}`,
			lat: i,
		}));
		const result = mergeSavedPlaces(full, [
			{ name: "Porto", lat: 41.1579, lon: -8.6291, favorite: true },
		]);
		expect(result).toMatchObject({ added: 0, skipped: 1 });
	});

	it("adds history only into free slots, keeping what is there", () => {
		const history = Array.from({ length: maxRecents + 2 }, (_, i) => ({
			name: `Spot ${i}`,
			lat: i,
			lon: 0,
			favorite: false,
			usedAt: 10 + i,
		}));
		const result = mergeSavedPlaces([madrid, lisbon], history);
		expect(result).toMatchObject({ added: maxRecents - 1, skipped: 3 });
		expect(result.locations.filter((l) => !l.favorite)).toHaveLength(
			maxRecents,
		);
		expect(result.locations.some((l) => l.name === "Lisbon")).toBe(true);
		expect(result.locations.some((l) => l.name === "Spot 6")).toBe(true);
		expect(result.locations.some((l) => l.name === "Spot 0")).toBe(false);
	});

	it("reads files without a favorite flag as starred", () => {
		const data = parseSavedPlacesExport(
			JSON.stringify({
				...buildSavedPlacesExport([]),
				places: [{ name: "Porto", lat: 41.1579, lon: -8.6291 }],
			}),
		);
		expect(data.places[0]?.favorite).toBe(true);
	});
});
