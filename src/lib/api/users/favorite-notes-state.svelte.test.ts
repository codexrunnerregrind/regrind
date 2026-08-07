import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getFavoriteNoteMock } = vi.hoisted(() => ({
	getFavoriteNoteMock: vi.fn(),
}));

vi.mock("$lib/api/users/favorites", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/users/favorites")>()),
	getFavoriteNote: getFavoriteNoteMock,
}));

import {
	cacheFavoriteNote,
	cacheFavoriteNotes,
	clearFavoriteNotes,
	ensureFavoriteNote,
	favoriteNote,
	refreshFavoriteNote,
} from "$lib/api/users/favorite-notes-state.svelte";

function listEntry(counterpartyId: number, notes = "", phoneNumber = "") {
	return { counterpartyId, notes, phoneNumber };
}

beforeEach(() => {
	getFavoriteNoteMock.mockReset();
	getFavoriteNoteMock.mockResolvedValue(null);
});

afterEach(() => {
	clearFavoriteNotes();
});

describe("favorite note state", () => {
	it("reports unknown for a profile it has never seen", () => {
		expect(favoriteNote(1)).toBeNull();
	});

	it("serves a note the list carried without reading it again", async () => {
		cacheFavoriteNotes([listEntry(1, "Met at the bar")]);

		expect(favoriteNote(1)?.notes).toBe("Met at the bar");
		await ensureFavoriteNote(1);
		expect(getFavoriteNoteMock).not.toHaveBeenCalled();
	});

	// A listed entry with no text is indistinguishable from a note the list left
	// out, so it is confirmed per profile rather than trusted as "no note".
	it("confirms a textless list entry per profile", async () => {
		cacheFavoriteNotes([listEntry(1)]);
		getFavoriteNoteMock.mockResolvedValue({
			notes: "Only the per-profile read has this",
			phoneNumber: "",
		});

		await ensureFavoriteNote(1);

		expect(favoriteNote(1)?.notes).toBe(
			"Only the per-profile read has this",
		);
	});

	it("does not re-read a note it already read per profile", async () => {
		getFavoriteNoteMock.mockResolvedValue({
			notes: "Gym buddy",
			phoneNumber: "",
		});

		await ensureFavoriteNote(1);
		await ensureFavoriteNote(1);

		expect(getFavoriteNoteMock).toHaveBeenCalledTimes(1);
	});

	it("does not re-read a favorite confirmed to have no note", async () => {
		getFavoriteNoteMock.mockResolvedValue(null);

		await ensureFavoriteNote(1);
		await ensureFavoriteNote(1);

		expect(getFavoriteNoteMock).toHaveBeenCalledTimes(1);
		expect(favoriteNote(1)).toEqual({ notes: "", phoneNumber: "" });
	});

	it("drops notes for profiles the list no longer lists", () => {
		cacheFavoriteNote(1, { notes: "Gone tomorrow", phoneNumber: "" });
		cacheFavoriteNote(2, { notes: "Still here", phoneNumber: "" });

		cacheFavoriteNotes([listEntry(2, "Still here")]);

		expect(favoriteNote(1)).toBeNull();
		expect(favoriteNote(2)?.notes).toBe("Still here");
	});

	it("re-reads on refresh even when the note is already known", async () => {
		cacheFavoriteNote(1, { notes: "Stale", phoneNumber: "" });
		getFavoriteNoteMock.mockResolvedValue({
			notes: "Fresh from the server",
			phoneNumber: "",
		});

		await refreshFavoriteNote(1);

		expect(favoriteNote(1)?.notes).toBe("Fresh from the server");
	});

	it("keeps showing what it has when a read fails", async () => {
		cacheFavoriteNotes([listEntry(1, "From the list")]);
		getFavoriteNoteMock.mockRejectedValue(new Error("offline"));

		await refreshFavoriteNote(1);

		expect(favoriteNote(1)).toBeNull();
		expect(
			() => refreshFavoriteNote(1),
			"a failed read must not leave the app throwing",
		).not.toThrow();
	});
});
