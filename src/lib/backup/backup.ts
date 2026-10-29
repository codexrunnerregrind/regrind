import z from "zod";

import {
	getPreferences,
	portablePreferences,
	readPortablePreferences,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import {
	buildSavedPlacesExport,
	importSavedPlaces,
	savedPlacesExportSchema,
	type SavedPlacesImportResult,
} from "$lib/app-data/saved-locations-transfer";
import {
	buildFavoritesExport,
	favoritesExportSchema,
	type FavoritesImportResult,
	importFavorites,
	loadFavoritesToExport,
} from "$lib/favorites/transfer";

const FILE_KIND = "regrind-backup";
const FILE_VERSION = 1;

export const backupSchema = z.object({
	kind: z.literal(FILE_KIND),
	version: z.number().int().positive(),
	exportedAt: z.string(),
	favorites: favoritesExportSchema.shape.favorites.default([]),
	places: savedPlacesExportSchema.shape.places.default([]),
	settings: z.record(z.string(), z.unknown()).default({}),
});

export type Backup = z.infer<typeof backupSchema>;

export function backupFilename(at: Date = new Date()): string {
	return `regrind-backup-${at.toISOString().slice(0, 10)}.json`;
}

export function buildBackup({
	favorites,
	preferences,
	at = new Date(),
}: {
	favorites: Parameters<typeof buildFavoritesExport>[0];
	preferences: Parameters<typeof portablePreferences>[0];
	at?: Date;
}): Backup {
	return {
		kind: FILE_KIND,
		version: FILE_VERSION,
		exportedAt: at.toISOString(),
		favorites: buildFavoritesExport(favorites).favorites,
		places: buildSavedPlacesExport(preferences.savedLocations).places,
		settings: portablePreferences(preferences),
	};
}

/** Reads favorites off the account, so this needs the network. */
export async function createBackup(): Promise<Backup> {
	const [favorites, preferences] = await Promise.all([
		loadFavoritesToExport(),
		getPreferences(),
	]);
	return buildBackup({ favorites, preferences });
}

export function serializeBackup(backup: Backup): string {
	return `${JSON.stringify(backup, null, "\t")}\n`;
}

export class BackupReadError extends Error {}

export function parseBackup(text: string): Backup {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		throw new BackupReadError("That file isn't valid JSON.");
	}
	const parsed = backupSchema.safeParse(json);
	if (!parsed.success) {
		throw new BackupReadError("That file isn't a ReGrind backup.");
	}
	if (parsed.data.version > FILE_VERSION) {
		throw new BackupReadError(
			"That backup was written by a newer version of ReGrind.",
		);
	}
	return parsed.data;
}

/** How many settings a restore would apply. */
export function backupSettingsCount(backup: Backup): number {
	return Object.keys(readPortablePreferences(backup.settings)).length;
}

export type RestoreParts = {
	favorites: boolean;
	places: boolean;
	settings: boolean;
};

export type RestoreResult = {
	settings: number;
	places: Omit<SavedPlacesImportResult, "locations"> | null;
	favorites: FavoritesImportResult | null;
};

/**
 * Settings and places first: they are local and instant. Favorites go through
 * the API one by one, so they come last and report progress.
 */
export async function restoreBackup(
	backup: Backup,
	parts: RestoreParts,
	onFavoriteProgress?: (done: number, total: number) => void,
): Promise<RestoreResult> {
	let settings = 0;
	if (parts.settings) {
		const values = readPortablePreferences(backup.settings);
		settings = Object.keys(values).length;
		if (settings > 0) await setPreferences(values);
	}
	const places =
		parts.places && backup.places.length > 0
			? await importSavedPlaces(backup.places)
			: null;
	const favorites =
		parts.favorites && backup.favorites.length > 0
			? await importFavorites(
					backup.favorites.map((favorite) => ({
						...favorite,
						displayName: favorite.displayName ?? null,
						profileImageMediaHash: null,
					})),
					onFavoriteProgress,
				)
			: null;
	return { settings, places, favorites };
}
