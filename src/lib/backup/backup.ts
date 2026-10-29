import z from "zod";

import {
	getPreferences,
	portablePreferences,
	readPortablePreferences,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import {
	buildSavedPlacesExport,
	type ExportedPlace,
	importSavedPlaces,
	savedPlacesExportSchema,
	type SavedPlacesImportResult,
} from "$lib/app-data/saved-locations-transfer";

const FILE_KIND = "regrind-backup";
const FILE_VERSION = 1;

/**
 * What only lives on this device. Favorites are kept by the server, so a
 * reinstall doesn't lose them; moving them between accounts is its own export.
 */
export const backupSchema = z.object({
	kind: z.literal(FILE_KIND),
	version: z.number().int().positive(),
	exportedAt: z.string(),
	places: savedPlacesExportSchema.shape.places.default([]),
	settings: z.record(z.string(), z.unknown()).default({}),
});

export type Backup = z.infer<typeof backupSchema>;

export function backupFilename(at: Date = new Date()): string {
	return `regrind-backup-${at.toISOString().slice(0, 10)}.json`;
}

export type BackupParts = { places: boolean; settings: boolean };

export function buildBackup({
	preferences,
	parts = { places: true, settings: true },
	at = new Date(),
}: {
	preferences: Parameters<typeof portablePreferences>[0];
	parts?: BackupParts;
	at?: Date;
}): Backup {
	return {
		kind: FILE_KIND,
		version: FILE_VERSION,
		exportedAt: at.toISOString(),
		places: parts.places
			? buildSavedPlacesExport(preferences.savedLocations).places
			: [],
		settings: parts.settings ? portablePreferences(preferences) : {},
	};
}

export async function createBackup(parts: BackupParts): Promise<Backup> {
	return buildBackup({ preferences: await getPreferences(), parts });
}

/** How many settings a backup would carry. */
export function portableSettingsCount(
	preferences: Parameters<typeof portablePreferences>[0],
): number {
	return Object.keys(portablePreferences(preferences)).length;
}

export function serializeBackup(backup: Backup): string {
	return `${JSON.stringify(backup, null, "\t")}\n`;
}

export class BackupReadError extends Error {}

/** Also takes a saved places export, which is a backup with only places. */
export function parseBackup(text: string): Backup {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		throw new BackupReadError("That file isn't valid JSON.");
	}
	const backup = backupSchema.safeParse(json);
	const places = backup.success
		? null
		: savedPlacesExportSchema.safeParse(json);
	const parsed: Backup | null = backup.success
		? backup.data
		: places?.success
			? { ...places.data, kind: FILE_KIND, settings: {} }
			: null;
	if (parsed === null) {
		throw new BackupReadError("That file isn't a ReGrind backup.");
	}
	if (parsed.version > FILE_VERSION) {
		throw new BackupReadError(
			"That backup was written by a newer version of ReGrind.",
		);
	}
	return parsed;
}

/** How many settings a restore would apply. */
export function backupSettingsCount(backup: Backup): number {
	return Object.keys(readPortablePreferences(backup.settings)).length;
}

export type RestoreResult = {
	settings: number;
	places: Omit<SavedPlacesImportResult, "locations"> | null;
};

export async function restoreBackup(
	backup: Backup,
	{ settings, places }: { settings: boolean; places: ExportedPlace[] },
): Promise<RestoreResult> {
	let applied = 0;
	if (settings) {
		const values = readPortablePreferences(backup.settings);
		applied = Object.keys(values).length;
		if (applied > 0) await setPreferences(values);
	}
	return {
		settings: applied,
		places: places.length > 0 ? await importSavedPlaces(places) : null,
	};
}
