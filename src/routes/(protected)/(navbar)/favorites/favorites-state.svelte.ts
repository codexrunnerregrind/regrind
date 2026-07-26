import { showErrorToast } from "$lib/api/error";
import { getFavoriteNotes } from "$lib/api/users/favorites";
import { getProfiles } from "$lib/api/users/profiles";
import type { RightNowStatus } from "$lib/model/right-now";

const PAGE_SIZE = 24;

// A favorite whose full profile came back from `/v3/profiles`.
export type FavoriteProfile = {
	type: "profile";
	profileId: number;
	displayName: string | null;
	profileImageMediaHash: string | null;
	distance: number | null;
	onlineUntil: number | null;
	isFavorite: boolean;
	age: number | null;
	rightNow: RightNowStatus | null;
};

// A favorite the profile batch didn't return (blocked, banned, deleted, …).
// Kept as a placeholder so the list count matches the favorites you actually
// have, the same way the official app shows unavailable favorites.
export type FavoritePlaceholder = {
	type: "placeholder";
	profileId: number;
};

export type FavoriteEntry = FavoriteProfile | FavoritePlaceholder;

// Fetch the favorite ids, then hydrate the full profiles. `getProfiles` returns
// them in an arbitrary order and silently omits ones it can't serve, so the
// result is re-sorted to the favorites order and every id is kept — hydrated
// where possible, otherwise as a placeholder.
async function loadFavorites(): Promise<FavoriteEntry[]> {
	const notes = await getFavoriteNotes();
	const ids = notes.map((note) => note.counterpartyId);
	if (ids.length === 0) return [];

	const profiles = await getProfiles(ids);
	const byId = new Map(profiles.map((profile) => [profile.profileId, profile]));

	return ids.map((id): FavoriteEntry => {
		const profile = byId.get(id);
		if (!profile) return { type: "placeholder", profileId: id };
		return {
			type: "profile",
			profileId: profile.profileId,
			displayName: profile.displayName,
			profileImageMediaHash: profile.profileImageMediaHash,
			distance: profile.distance,
			onlineUntil: profile.onlineUntil ?? null,
			isFavorite: profile.isFavorite,
			age: profile.age,
			rightNow: profile.rightNow,
		};
	});
}

// Persists the last-loaded favorites across navigations so re-entering the
// screen shows content immediately (refreshed silently in the background)
// instead of flashing the loading skeletons.
let cached: FavoriteEntry[] | null = null;

export class FavoritesState {
	loading = $state(true);
	refreshing = $state(false);
	error: Error | null = $state(null);
	visibleCount = $state(PAGE_SIZE);

	#profiles: FavoriteEntry[] = $state([]);

	get favorites(): FavoriteEntry[] {
		return this.#profiles.slice(0, this.visibleCount);
	}

	get hasMore(): boolean {
		return this.visibleCount < this.#profiles.length;
	}

	#initial: Promise<void>;
	#destroyed = false;

	constructor() {
		if (cached !== null) {
			this.#profiles = cached;
			this.loading = false;
			this.#initial = Promise.resolve();
			void this.#backgroundRefresh();
		} else {
			this.#initial = this.#initialLoad();
		}
	}

	destroy(): void {
		if (this.#destroyed) return;
		this.#destroyed = true;
		cached = this.#profiles;
	}

	loadMore(): void {
		if (!this.hasMore) return;
		this.visibleCount += PAGE_SIZE;
	}

	retry(): void {
		this.#initial = this.#initialLoad();
	}

	async refresh(): Promise<void> {
		if (this.#destroyed || this.refreshing) return;
		this.refreshing = true;
		try {
			await this.#initial.catch(() => {});
			const profiles = await loadFavorites();
			if (this.#destroyed) return;
			this.#profiles = profiles;
			cached = profiles;
			this.error = null;
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to refresh favorites", error });
		} finally {
			this.refreshing = false;
		}
	}

	// Refreshes cached data without toggling loading/refreshing, so a revisit
	// updates in place with no skeleton or refresh indicator.
	async #backgroundRefresh(): Promise<void> {
		try {
			const profiles = await loadFavorites();
			if (this.#destroyed) return;
			this.#profiles = profiles;
			cached = profiles;
		} catch {
			// Keep showing cached data on failure.
		}
	}

	async #initialLoad(): Promise<void> {
		this.loading = true;
		this.error = null;
		try {
			const profiles = await loadFavorites();
			if (this.#destroyed) return;
			this.#profiles = profiles;
			cached = profiles;
		} catch (err) {
			if (this.#destroyed) return;
			this.error = err instanceof Error ? err : new Error(String(err));
		} finally {
			this.loading = false;
		}
	}
}
