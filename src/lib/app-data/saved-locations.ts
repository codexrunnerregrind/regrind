import {
	getPreferences,
	getSavedLocationsSnapshot,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import {
	deriveLocationName,
	maxFavorites,
	maxRecents,
	type SavedLocation,
	sortSavedLocations,
	spotKey,
} from "$lib/model/saved-location";

export function getFavoriteLocations(): SavedLocation[] {
	return sortSavedLocations(
		getSavedLocationsSnapshot().filter((location) => location.favorite),
	);
}

export function getRecentLocations(): SavedLocation[] {
	return sortSavedLocations(
		getSavedLocationsSnapshot().filter((location) => !location.favorite),
	);
}

/** Drops the oldest history entries past the cap; favorites are never evicted. */
function prune(locations: SavedLocation[]): SavedLocation[] {
	const kept = new Set(
		sortSavedLocations(locations.filter((l) => !l.favorite))
			.slice(0, maxRecents)
			.map((l) => l.id),
	);
	return locations.filter((l) => l.favorite || kept.has(l.id));
}

async function update(
	mutate: (locations: SavedLocation[]) => SavedLocation[],
): Promise<void> {
	const { savedLocations } = await getPreferences();
	await setPreferences({ savedLocations: prune(mutate(savedLocations)) });
}

/**
 * Records a pick in the history, or bumps the matching existing entry. A
 * renamed entry keeps its name — the auto-derived one is only used on insert.
 * Returns the id of the affected entry.
 */
export async function rememberLocation({
	lat,
	lon,
	label,
	favorite = false,
	now = Date.now(),
}: {
	lat: number;
	lon: number;
	label?: string | undefined;
	favorite?: boolean;
	now?: number;
}): Promise<string> {
	const key = spotKey({ lat, lon });
	const { savedLocations } = await getPreferences();
	const existing = savedLocations.find(
		(location) => spotKey(location) === key,
	);
	if (existing) {
		await update((locations) =>
			locations.map((location) =>
				location.id === existing.id
					? {
							...location,
							usedAt: now,
							favorite: location.favorite || favorite,
						}
					: location,
			),
		);
		return existing.id;
	}
	if (
		favorite &&
		savedLocations.filter((location) => location.favorite).length >=
			maxFavorites
	) {
		throw new Error("Too many saved locations");
	}
	const id = crypto.randomUUID();
	await update((locations) => [
		...locations,
		{
			id,
			name: deriveLocationName({ lat, lon, label }),
			lat,
			lon,
			favorite,
			usedAt: now,
		},
	]);
	return id;
}

/** Bumps an entry to the top of its list, e.g. after picking it again. */
export async function touchSavedLocation(
	id: string,
	now = Date.now(),
): Promise<void> {
	await update((locations) =>
		locations.map((location) =>
			location.id === id ? { ...location, usedAt: now } : location,
		),
	);
}

export async function renameSavedLocation(
	id: string,
	name: string,
): Promise<void> {
	const trimmed = name.trim().slice(0, 60);
	if (!trimmed) return;
	await update((locations) =>
		locations.map((location) =>
			location.id === id ? { ...location, name: trimmed } : location,
		),
	);
}

export async function setSavedLocationFavorite(
	id: string,
	favorite: boolean,
): Promise<void> {
	const { savedLocations } = await getPreferences();
	if (
		favorite &&
		savedLocations.filter((location) => location.favorite).length >=
			maxFavorites
	) {
		throw new Error("Too many saved locations");
	}
	await update((locations) =>
		locations.map((location) =>
			location.id === id ? { ...location, favorite } : location,
		),
	);
}

export async function removeSavedLocation(id: string): Promise<void> {
	await update((locations) =>
		locations.filter((location) => location.id !== id),
	);
}

export async function clearRecentLocations(): Promise<void> {
	await update((locations) => locations.filter((l) => l.favorite));
}
