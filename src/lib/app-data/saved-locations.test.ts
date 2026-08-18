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

import { maxRecents } from "$lib/model/saved-location";
import { getSavedLocationsSnapshot } from "./preferences.svelte";
import {
	clearRecentLocations,
	getFavoriteLocations,
	getRecentLocations,
	rememberLocation,
	removeSavedLocation,
	renameSavedLocation,
	setSavedLocationFavorite,
	touchSavedLocation,
} from "./saved-locations";

const madrid = { lat: 40.4227, lon: -3.6976 };

beforeEach(async () => {
	vi.resetModules();
	existsMock.mockResolvedValue(false);
	readMock.mockResolvedValue(encode({}));
	writeMock.mockResolvedValue(undefined);
	// Each test starts from a clean store: the module cache is shared, so wipe
	// whatever previous cases left behind.
	for (const location of getSavedLocationsSnapshot()) {
		await removeSavedLocation(location.id);
	}
});

describe("rememberLocation", () => {
	it("names a hand-dropped pin after its coordinates", async () => {
		await rememberLocation({ ...madrid, now: 1 });
		expect(getRecentLocations()).toHaveLength(1);
		expect(getRecentLocations()[0]?.name).toBe("40.4227° N, 3.6976° W");
		expect(getRecentLocations()[0]?.favorite).toBe(false);
	});

	it("uses the searched place name when one is supplied", async () => {
		await rememberLocation({ ...madrid, label: "Puerta del Sol", now: 1 });
		expect(getRecentLocations()[0]?.name).toBe("Puerta del Sol");
	});

	it("bumps a nearby existing entry instead of duplicating it", async () => {
		const first = await rememberLocation({ ...madrid, now: 1 });
		const second = await rememberLocation({
			lat: madrid.lat + 0.00001,
			lon: madrid.lon,
			label: "Somewhere else",
			now: 2,
		});
		expect(second).toBe(first);
		expect(getRecentLocations()).toHaveLength(1);
		// A renamed entry keeps the user's name.
		expect(getRecentLocations()[0]?.name).toBe("40.4227° N, 3.6976° W");
		expect(getRecentLocations()[0]?.usedAt).toBe(2);
	});

	it("keeps a starred pin out of the history list", async () => {
		await rememberLocation({ ...madrid, favorite: true, now: 1 });
		expect(getRecentLocations()).toHaveLength(0);
		expect(getFavoriteLocations()).toHaveLength(1);
	});

	it("evicts the oldest history entries past the cap", async () => {
		for (let index = 0; index < maxRecents + 3; index++) {
			await rememberLocation({
				lat: 10 + index,
				lon: 10,
				now: index + 1,
			});
		}
		const recents = getRecentLocations();
		expect(recents).toHaveLength(maxRecents);
		// Newest first, and the three oldest are gone.
		expect(recents[0]?.usedAt).toBe(maxRecents + 3);
		expect(recents.at(-1)?.usedAt).toBe(4);
	});

	it("never evicts favorites", async () => {
		await rememberLocation({ ...madrid, favorite: true, now: 1 });
		for (let index = 0; index < maxRecents + 3; index++) {
			await rememberLocation({
				lat: 10 + index,
				lon: 10,
				now: index + 2,
			});
		}
		expect(getFavoriteLocations()).toHaveLength(1);
		expect(getRecentLocations()).toHaveLength(maxRecents);
	});
});

describe("editing", () => {
	it("renames an entry, trimming the input", async () => {
		const id = await rememberLocation({ ...madrid, now: 1 });
		await renameSavedLocation(id, "  Home  ");
		expect(getRecentLocations()[0]?.name).toBe("Home");
	});

	it("ignores a blank rename", async () => {
		const id = await rememberLocation({ ...madrid, label: "Home", now: 1 });
		await renameSavedLocation(id, "   ");
		expect(getRecentLocations()[0]?.name).toBe("Home");
	});

	it("moves an entry between the two lists", async () => {
		const id = await rememberLocation({ ...madrid, now: 1 });
		await setSavedLocationFavorite(id, true);
		expect(getFavoriteLocations()).toHaveLength(1);
		expect(getRecentLocations()).toHaveLength(0);
		await setSavedLocationFavorite(id, false);
		expect(getRecentLocations()).toHaveLength(1);
	});

	it("deletes an entry", async () => {
		const id = await rememberLocation({ ...madrid, now: 1 });
		await removeSavedLocation(id);
		expect(getSavedLocationsSnapshot()).toHaveLength(0);
	});

	it("bumps an entry when it is picked again", async () => {
		const older = await rememberLocation({ ...madrid, now: 1 });
		await rememberLocation({ lat: 10, lon: 10, now: 2 });
		await touchSavedLocation(older, 3);
		expect(getRecentLocations()[0]?.id).toBe(older);
	});

	it("clears the history but keeps favorites", async () => {
		await rememberLocation({ ...madrid, favorite: true, now: 1 });
		await rememberLocation({ lat: 10, lon: 10, now: 2 });
		await clearRecentLocations();
		expect(getRecentLocations()).toHaveLength(0);
		expect(getFavoriteLocations()).toHaveLength(1);
	});
});
