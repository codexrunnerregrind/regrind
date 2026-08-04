import { SvelteMap } from "svelte/reactivity";

import { registerAccountCache } from "$lib/api/account-caches";
import { getFavoriteNote, getFavoriteNotes } from "$lib/api/users/favorites";
import { now } from "$lib/util/clock";
import type {
	FavoriteNote,
	FavoriteNoteContent,
} from "$lib/model/users/favorites";

/**
 * The notes the user attached to their favorites, keyed by profile id.
 *
 * Filled from `GET /v1/favorites/notes` when the favorites grid loads, and per
 * profile for anyone arriving at a profile screen directly. Keeping them in one
 * reactive map means editing a note on a profile is reflected in the grid (and
 * in its search) without re-fetching anything.
 */
const notes = new SvelteMap<number, FavoriteNoteContent>();

// Profiles whose note is known to be current: read per profile, or listed with
// text. A listed entry with no text is not enough — that is also what a note
// the list left out would look like — so those are confirmed per profile once.
const known = new Set<number>();

const requests = new Map<number, Promise<void>>();

export const EMPTY_FAVORITE_NOTE: FavoriteNoteContent = {
	notes: "",
	phoneNumber: "",
};

function hasText(note: FavoriteNoteContent): boolean {
	return note.notes !== "" || note.phoneNumber !== "";
}

/** The cached note, or `null` while it is unknown. */
export function favoriteNote(profileId: number): FavoriteNoteContent | null {
	return notes.get(profileId) ?? null;
}

/** Every note held, keyed by profile — the favorites the notes list named. */
export function favoriteNotes(): ReadonlyMap<number, FavoriteNoteContent> {
	return notes;
}

export function cacheFavoriteNote(
	profileId: number,
	note: FavoriteNoteContent,
): void {
	notes.set(profileId, { notes: note.notes, phoneNumber: note.phoneNumber });
	known.add(profileId);
}

/**
 * Records a whole `GET /v1/favorites/notes` response. Profiles missing from it
 * are no longer favorited, so their notes are dropped rather than left behind
 * to be matched by a later search.
 */
export function cacheFavoriteNotes(list: readonly FavoriteNote[]): void {
	const seen = new Set<number>();
	for (const note of list) {
		const profileId = note.counterpartyId;
		seen.add(profileId);
		notes.set(profileId, {
			notes: note.notes,
			phoneNumber: note.phoneNumber,
		});
		if (hasText(note)) known.add(profileId);
	}
	for (const profileId of notes.keys()) {
		if (!seen.has(profileId)) forgetFavoriteNote(profileId);
	}
}

export function forgetFavoriteNote(profileId: number): void {
	notes.delete(profileId);
	known.delete(profileId);
	requests.delete(profileId);
}

/**
 * Reads one profile's note unless it is already known. Concurrent callers share
 * the request. Failures are swallowed: a note that cannot be read leaves the
 * pill in its "no note yet" state, which is recoverable, and the profile screen
 * should not fail over it.
 */
export function ensureFavoriteNote(profileId: number): Promise<void> {
	if (known.has(profileId)) return Promise.resolve();
	let request = requests.get(profileId);
	if (!request) {
		request = getFavoriteNote({ profileId })
			.then((note) => {
				cacheFavoriteNote(profileId, note ?? EMPTY_FAVORITE_NOTE);
			})
			.catch((error: unknown) => {
				console.error(error);
			})
			.finally(() => {
				requests.delete(profileId);
			});
		requests.set(profileId, request);
	}
	return request;
}

/** Re-reads a note from the server, ignoring what is cached. */
export function refreshFavoriteNote(profileId: number): Promise<void> {
	forgetFavoriteNote(profileId);
	return ensureFavoriteNote(profileId);
}

// One list read covers every favorite, so screens that only show notes — the
// browse grid, filtered to favorites — share a recent one rather than each
// fetching their own.
const LIST_TTL_MS = 60_000;

let listReadAt = 0;
let listRequest: Promise<void> | null = null;

/**
 * Loads the notes of every favorite unless that was done recently. Used by
 * screens that show notes without owning the favorites list themselves.
 */
export function ensureFavoriteNotes(): Promise<void> {
	if (now() - listReadAt < LIST_TTL_MS) return Promise.resolve();
	if (!listRequest) {
		listRequest = getFavoriteNotes()
			.then((list) => {
				cacheFavoriteNotes(list);
				listReadAt = now();
			})
			.catch((error: unknown) => {
				// Notes are decoration on these screens: without them the cards just
				// show no note, which is better than failing the grid.
				console.error(error);
			})
			.finally(() => {
				listRequest = null;
			});
	}
	return listRequest;
}

export function clearFavoriteNotes(): void {
	notes.clear();
	known.clear();
	requests.clear();
	listReadAt = 0;
	listRequest = null;
}

registerAccountCache({ reset: clearFavoriteNotes });
