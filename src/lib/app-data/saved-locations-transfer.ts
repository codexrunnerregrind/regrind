import z from "zod";

import {
	getPreferences,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import {
	maxFavorites,
	maxRecents,
	type SavedLocation,
	savedLocationSchema,
	spotKey,
} from "$lib/model/saved-location";

const FILE_KIND = "regrind-saved-places";
const FILE_VERSION = 1;

const exportedPlaceSchema = savedLocationSchema
	.pick({ name: true, lat: true, lon: true })
	.extend({
		// Absent in files from before history was exported.
		favorite: z.boolean().default(true),
		usedAt: z.number().optional(),
	});

export const savedPlacesExportSchema = z.object({
	kind: z.literal(FILE_KIND),
	version: z.number().int().positive(),
	exportedAt: z.string(),
	places: z.array(exportedPlaceSchema),
});

export type SavedPlacesExport = z.infer<typeof savedPlacesExportSchema>;
export type ExportedPlace = z.infer<typeof exportedPlaceSchema>;

export function savedPlacesExportFilename(at: Date = new Date()): string {
	return `regrind-saved-places-${at.toISOString().slice(0, 10)}.json`;
}

export function buildSavedPlacesExport(
	locations: readonly SavedLocation[],
	at: Date = new Date(),
): SavedPlacesExport {
	return {
		kind: FILE_KIND,
		version: FILE_VERSION,
		exportedAt: at.toISOString(),
		places: locations.map(({ name, lat, lon, favorite, usedAt }) => ({
			name,
			lat,
			lon,
			favorite,
			usedAt,
		})),
	};
}

export function serializeSavedPlacesExport(data: SavedPlacesExport): string {
	return `${JSON.stringify(data, null, "\t")}\n`;
}

export class SavedPlacesImportError extends Error {}

export function parseSavedPlacesExport(text: string): SavedPlacesExport {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		throw new SavedPlacesImportError("That file isn't valid JSON.");
	}
	const parsed = savedPlacesExportSchema.safeParse(json);
	if (!parsed.success) {
		throw new SavedPlacesImportError(
			"That file isn't a ReGrind saved places export.",
		);
	}
	if (parsed.data.version > FILE_VERSION) {
		throw new SavedPlacesImportError(
			"That export was written by a newer version of ReGrind.",
		);
	}
	return parsed.data;
}

/**
 * What importing a place would do: add it, star an existing recent at the same
 * spot, or nothing because it is already saved.
 */
export type PlaceImportStatus = "new" | "star" | "saved";

export function placeImportStatus(
	current: readonly SavedLocation[],
	place: ExportedPlace,
): PlaceImportStatus {
	const key = spotKey(place);
	const match = current.find((location) => spotKey(location) === key);
	if (!match) return "new";
	return place.favorite && !match.favorite ? "star" : "saved";
}

export type SavedPlacesImportResult = {
	locations: SavedLocation[];
	added: number;
	/** Already saved at the same spot; starred if the file has them starred. */
	existing: number;
	/** Dropped for going over {@link maxFavorites} or {@link maxRecents}. */
	skipped: number;
};

/** Adds the file's places; nothing already saved is renamed or removed. */
export function mergeSavedPlaces(
	current: readonly SavedLocation[],
	places: readonly ExportedPlace[],
	now: number = Date.now(),
): SavedPlacesImportResult {
	const locations = [...current];
	let favorites = locations.filter((location) => location.favorite).length;
	let recents = locations.length - favorites;
	let added = 0;
	let existing = 0;
	let skipped = 0;
	// Newest first, so a full history keeps the most recent of the file's.
	const ordered = places.toSorted(
		(a, b) => (b.usedAt ?? 0) - (a.usedAt ?? 0),
	);
	for (const place of ordered) {
		const key = spotKey(place);
		const index = locations.findIndex(
			(location) => spotKey(location) === key,
		);
		const match = locations[index];
		if (match && (match.favorite || !place.favorite)) {
			existing++;
			continue;
		}
		if (
			place.favorite ? favorites >= maxFavorites : recents >= maxRecents
		) {
			skipped++;
			continue;
		}
		if (match) {
			locations[index] = { ...match, favorite: true };
			favorites++;
			recents--;
			existing++;
			continue;
		}
		if (place.favorite) favorites++;
		else recents++;
		added++;
		locations.push({
			id: crypto.randomUUID(),
			name: place.name,
			lat: place.lat,
			lon: place.lon,
			favorite: place.favorite,
			usedAt: place.usedAt ?? now,
		});
	}
	return { locations, added, existing, skipped };
}

export async function importSavedPlaces(
	places: readonly ExportedPlace[],
): Promise<Omit<SavedPlacesImportResult, "locations">> {
	const { savedLocations } = await getPreferences();
	const { locations, ...result } = mergeSavedPlaces(savedLocations, places);
	await setPreferences({ savedLocations: locations });
	return result;
}
