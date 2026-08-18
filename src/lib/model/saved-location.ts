import z from "zod";

import { encodeGeohash } from "./geohash";

export const savedLocationSchema = z.object({
	id: z.string(),
	/** Auto-derived on first save (place name or coordinates), user-editable. */
	name: z.string().min(1).max(60),
	lat: z.number().min(-90).max(90),
	lon: z.number().min(-180).max(180),
	/**
	 * Explicitly kept by the user. Unfavorited entries are plain history and get
	 * evicted once {@link maxRecents} newer picks pile up.
	 */
	favorite: z.boolean().default(false),
	/** Epoch ms of the last pick; orders both lists and drives eviction. */
	usedAt: z.number(),
});

export type SavedLocation = z.infer<typeof savedLocationSchema>;

/** How many non-favorite (history) entries are kept. */
export const maxRecents = 5;

/** Upper bound on favorites, so the preferences file cannot grow unbounded. */
export const maxFavorites = 50;

/**
 * Two picks land on the same entry when they agree to ~19m (geohash precision
 * 8), so nudging the pin a few metres bumps the existing place instead of
 * filling the history with near-duplicates.
 */
export function spotKey({ lat, lon }: { lat: number; lon: number }): string {
	return encodeGeohash({ lat, lon }).slice(0, 8);
}

/** Formats coordinates the way a name-less saved location is labelled. */
export function formatCoordinates({
	lat,
	lon,
}: {
	lat: number;
	lon: number;
}): string {
	const latPart = `${Math.abs(lat).toFixed(4)}° ${lat < 0 ? "S" : "N"}`;
	const lonPart = `${Math.abs(lon).toFixed(4)}° ${lon < 0 ? "W" : "E"}`;
	return `${latPart}, ${lonPart}`;
}

/**
 * The name a location gets when it is first remembered: whatever label the pick
 * came with (a searched place name), falling back to its coordinates.
 */
export function deriveLocationName({
	lat,
	lon,
	label,
}: {
	lat: number;
	lon: number;
	label?: string | undefined;
}): string {
	const trimmed = label?.trim();
	if (trimmed) return trimmed.slice(0, 60);
	return formatCoordinates({ lat, lon });
}

/** Favorites first, then history — each newest-first. */
export function sortSavedLocations(
	locations: readonly SavedLocation[],
): SavedLocation[] {
	return locations.toSorted((a, b) => {
		if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
		return b.usedAt - a.usedAt;
	});
}
