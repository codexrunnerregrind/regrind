import { describe, expect, it } from "vitest";

import {
	type FavoriteEntry,
	favoriteMatchesQuery,
} from "./favorites-state.svelte";

const entry: FavoriteEntry = {
	type: "profile",
	profileId: 1,
	displayName: "Henry",
	profileImageMediaHash: null,
	distance: null,
	onlineUntil: null,
	isFavorite: true,
	age: null,
	rightNow: null,
};

const note = { notes: "Met at the bar on Rua Nova", phoneNumber: "912345678" };

describe("favoriteMatchesQuery", () => {
	it("keeps everything when nothing is typed", () => {
		expect(favoriteMatchesQuery(entry, null, "")).toBe(true);
		expect(favoriteMatchesQuery(entry, null, "   ")).toBe(true);
	});

	it("matches the note regardless of case or surrounding space", () => {
		expect(favoriteMatchesQuery(entry, note, "rua nova")).toBe(true);
		expect(favoriteMatchesQuery(entry, note, "  BAR ")).toBe(true);
	});

	it("matches the phone number and the display name", () => {
		expect(favoriteMatchesQuery(entry, note, "9123")).toBe(true);
		expect(favoriteMatchesQuery(entry, note, "hen")).toBe(true);
	});

	it("rejects text that appears nowhere", () => {
		expect(favoriteMatchesQuery(entry, note, "porto")).toBe(false);
	});

	it("drops entries with no note and no name", () => {
		const placeholder: FavoriteEntry = { type: "placeholder", profileId: 2 };
		expect(favoriteMatchesQuery(placeholder, null, "bar")).toBe(false);
		expect(favoriteMatchesQuery(placeholder, null, "")).toBe(true);
	});
});
