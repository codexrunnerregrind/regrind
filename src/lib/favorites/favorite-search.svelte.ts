import {
	ensureFavoriteNotes,
	favoriteNote,
	favoriteNotes,
} from "$lib/api/users/favorite-notes-state.svelte";
import { getProfiles } from "$lib/api/users/profiles";
import type { RightNowStatus } from "$lib/model/right-now";

/**
 * Whether a favorite matches what was typed. Notes are the point of the search
 * — they are the only text the user wrote themselves — but the display name is
 * matched too, since that is what the card shows and looking someone up by name
 * is the obvious other thing to try.
 */
export function favoriteMatchesQuery(
	candidate: {
		displayName?: string | null;
		notes?: string | null;
		phoneNumber?: string | null;
	},
	query: string,
): boolean {
	const needle = query.trim().toLowerCase();
	if (needle === "") return true;
	return [candidate.notes, candidate.phoneNumber, candidate.displayName].some(
		(value) => value?.toLowerCase().includes(needle),
	);
}

export type FavoriteSearchResult = {
	profileId: number;
	displayName: string | null;
	profileImageMediaHash: string | null;
	distance: number | null;
	onlineUntil: number | null;
	age: number | null;
	rightNow: RightNowStatus | null;
	note: string;
};

/**
 * Searching favorites by note, for the grid's search field.
 *
 * The grid itself is paged by the server, so filtering what it happens to have
 * loaded would silently miss matches further down. Instead every favorite is
 * hydrated once — the notes list names them all, and profiles come back in one
 * batch — and the search runs over that, so a match is found wherever it is.
 */
export class FavoriteSearch {
	query = $state("");
	loading = $state(false);
	error: Error | null = $state(null);

	#profiles = $state<Omit<FavoriteSearchResult, "note">[]>([]);
	#loaded = false;
	#request: Promise<void> | null = null;

	get active(): boolean {
		return this.query.trim() !== "";
	}

	get results(): FavoriteSearchResult[] {
		if (!this.active) return [];
		return this.#profiles
			.map((profile) => ({
				...profile,
				note: favoriteNote(profile.profileId)?.notes ?? "",
			}))
			.filter((profile) =>
				favoriteMatchesQuery(
					{
						displayName: profile.displayName,
						notes: profile.note,
						phoneNumber: favoriteNote(profile.profileId)?.phoneNumber,
					},
					this.query,
				),
			);
	}

	search(query: string): void {
		this.query = query;
		if (this.active) void this.#load();
	}

	clear(): void {
		this.query = "";
		this.error = null;
	}

	// Runs on the first search rather than up front: someone who never searches
	// should not pay for hydrating their whole favorites list.
	async #load(): Promise<void> {
		if (this.#loaded) return;
		this.#request ??= this.#hydrate().finally(() => {
			this.#request = null;
		});
		return this.#request;
	}

	async #hydrate(): Promise<void> {
		this.loading = true;
		this.error = null;
		try {
			await ensureFavoriteNotes();
			const ids = [...favoriteNotes().keys()];
			if (ids.length === 0) {
				this.#profiles = [];
				this.#loaded = true;
				return;
			}
			const profiles = await getProfiles(ids);
			this.#profiles = profiles.map((profile) => ({
				profileId: profile.profileId,
				displayName: profile.displayName,
				profileImageMediaHash: profile.profileImageMediaHash,
				distance: profile.distance,
				onlineUntil: profile.onlineUntil ?? null,
				age: profile.age,
				rightNow: profile.rightNow,
			}));
			this.#loaded = true;
		} catch (error) {
			this.error = error instanceof Error ? error : new Error(String(error));
		} finally {
			this.loading = false;
		}
	}

	/** Re-hydrates on the next search, after favorites or notes have changed. */
	invalidate(): void {
		this.#loaded = false;
	}
}
