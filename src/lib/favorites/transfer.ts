import z from "zod";

import { clearFavoriteNotes } from "$lib/api/users/favorite-notes-state.svelte";
import {
	addFavoriteUser,
	getFavoriteNotes,
	setFavoriteNote,
} from "$lib/api/users/favorites";
import { getProfiles } from "$lib/api/users/profiles";
import { getActiveGeohashSnapshot } from "$lib/app-data/preferences.svelte";
import { getGrid } from "$lib/grid/grid";
import { favoriteNoteIsEmpty } from "$lib/model/users/favorites";

/** Marks the file as ours, so an unrelated JSON is rejected with a reason. */
const FILE_KIND = "regrind-favorites";
const FILE_VERSION = 1;

const exportedFavoriteSchema = z.object({
	profileId: z.coerce.number().int().positive(),
	// For the reader of the file, and as a fallback name on import.
	displayName: z.string().nullish(),
	notes: z
		.string()
		.nullish()
		.transform((value) => value ?? ""),
	phoneNumber: z
		.string()
		.nullish()
		.transform((value) => value ?? ""),
});

export const favoritesExportSchema = z.object({
	kind: z.literal(FILE_KIND),
	version: z.number().int().positive(),
	exportedAt: z.string(),
	favorites: z.array(exportedFavoriteSchema),
});

export type FavoritesExport = z.infer<typeof favoritesExportSchema>;
export type ExportedFavorite = z.infer<typeof exportedFavoriteSchema>;

/** Whether the entry carries anything the user wrote — a note or a number. */
export function favoriteHasNote(entry: ExportedFavorite): boolean {
	return !favoriteNoteIsEmpty(entry);
}

/** One row in the export/import preview: the note plus what it takes to show it. */
export type FavoriteTransferEntry = ExportedFavorite & {
	displayName: string | null;
	profileImageMediaHash: string | null;
};

export function favoritesExportFilename(at: Date = new Date()): string {
	const stamp = at.toISOString().slice(0, 10);
	return `regrind-favorites-${stamp}.json`;
}

// Best-effort: ids that can't be read keep whatever the caller had.
async function hydrate(
	ids: number[],
): Promise<
	Map<number, { displayName: string | null; mediaHash: string | null }>
> {
	const hydrated = new Map<
		number,
		{ displayName: string | null; mediaHash: string | null }
	>();
	if (ids.length === 0) return hydrated;
	try {
		for (const profile of await getProfiles(ids)) {
			hydrated.set(profile.profileId, {
				displayName: profile.displayName,
				mediaHash: profile.profileImageMediaHash,
			});
		}
	} catch (error) {
		console.error(error);
	}
	return hydrated;
}

const MAX_FAVORITE_PAGES = 100;

/**
 * Every favorited profile id, paged out of the favorites cascade.
 *
 * `GET /v1/favorites/notes` is *not* this list — it only names favorites that
 * have a note, so reading it alone drops everyone never written about.
 */
async function listFavoriteProfileIds(): Promise<number[]> {
	const geohash = getActiveGeohashSnapshot();
	if (geohash === null) return [];
	const ids: number[] = [];

	const seen = new Set<number>();
	let page = 0;
	for (let fetched = 0; fetched < MAX_FAVORITE_PAGES; fetched += 1) {
		const result = await getGrid({
			nearbyGeoHash: geohash,
			favorites: true,
			...(page > 0 && { pageNumber: page }),
		});
		for (const item of result.items) {
			if (seen.has(item.id)) continue;
			seen.add(item.id);
			ids.push(item.id);
		}
		const next = result.nextPage;
		// `null` and `0` both mean "no more"; not moving forward would re-read.
		if (next === null || next <= page) break;
		page = next;
	}
	return ids;
}

/** Every favorite with its note, ready to be previewed and ticked. */
export async function loadFavoritesToExport(): Promise<
	FavoriteTransferEntry[]
> {
	const [ids, notes] = await Promise.all([
		listFavoriteProfileIds(),
		getFavoriteNotes(),
	]);
	const noteOf = new Map(notes.map((note) => [note.counterpartyId, note]));
	// Anyone the cascade missed — or all of them, when there is no location to
	// run it from — still comes in off the notes list.
	const ordered = [...ids];
	const listed = new Set(ids);
	for (const note of notes) {
		if (listed.has(note.counterpartyId)) continue;
		listed.add(note.counterpartyId);
		ordered.push(note.counterpartyId);
	}
	const hydrated = await hydrate(ordered);
	return ordered.map((profileId) => ({
		profileId,
		displayName: hydrated.get(profileId)?.displayName ?? null,
		profileImageMediaHash: hydrated.get(profileId)?.mediaHash ?? null,
		notes: noteOf.get(profileId)?.notes ?? "",
		phoneNumber: noteOf.get(profileId)?.phoneNumber ?? "",
	}));
}

/** The file's contents for the entries the user kept ticked. */
export function buildFavoritesExport(
	entries: FavoriteTransferEntry[],
): FavoritesExport {
	return {
		kind: FILE_KIND,
		version: FILE_VERSION,
		exportedAt: new Date().toISOString(),
		favorites: entries.map((entry) => ({
			profileId: entry.profileId,
			displayName: entry.displayName,
			notes: entry.notes,
			phoneNumber: entry.phoneNumber,
		})),
	};
}

export function serializeFavoritesExport(data: FavoritesExport): string {
	return `${JSON.stringify(data, null, "\t")}\n`;
}

export class FavoritesImportError extends Error {}

/** Validates a picked file, so a bad pick is reported before anything is written. */
export function parseFavoritesExport(text: string): FavoritesExport {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		throw new FavoritesImportError("That file isn't valid JSON.");
	}
	const parsed = favoritesExportSchema.safeParse(json);
	if (!parsed.success) {
		throw new FavoritesImportError(
			"That file isn't a ReGrind favorites export.",
		);
	}
	if (parsed.data.version > FILE_VERSION) {
		throw new FavoritesImportError(
			"That export was written by a newer version of ReGrind.",
		);
	}
	return parsed.data;
}

/** The file's entries with current names and avatars, for the preview. */
export async function loadFavoritesToImport(
	data: FavoritesExport,
): Promise<FavoriteTransferEntry[]> {
	const hydrated = await hydrate(
		data.favorites.map((favorite) => favorite.profileId),
	);
	return data.favorites.map((favorite) => ({
		...favorite,
		displayName:
			hydrated.get(favorite.profileId)?.displayName ??
			favorite.displayName ??
			null,
		profileImageMediaHash:
			hydrated.get(favorite.profileId)?.mediaHash ?? null,
	}));
}

export type FavoritesImportResult = {
	added: number;
	failed: number;
	/** Favorited, but whose note could not be written. */
	notesFailed: number;
};

/**
 * Re-favorites everyone given and restores their notes. One at a time, so a
 * failure (deleted or blocking profile) is counted rather than taking the rest
 * with it. Merges: favorites already on the account are left alone.
 */
export async function importFavorites(
	entries: FavoriteTransferEntry[],
	onProgress?: (done: number, total: number) => void,
): Promise<FavoritesImportResult> {
	const total = entries.length;
	let added = 0;
	let failed = 0;
	let notesFailed = 0;

	for (const [index, favorite] of entries.entries()) {
		const note = {
			notes: favorite.notes,
			phoneNumber: favorite.phoneNumber,
		};
		try {
			await addFavoriteUser({ profileId: favorite.profileId });
			added += 1;
			if (!favoriteNoteIsEmpty(note)) {
				try {
					await setFavoriteNote({
						profileId: favorite.profileId,
						note,
					});
				} catch (error) {
					console.error(error);
					notesFailed += 1;
				}
			}
		} catch (error) {
			console.error(error);
			failed += 1;
		}
		onProgress?.(index + 1, total);
	}

	// Stale now — the grid and its search must re-read.
	clearFavoriteNotes();

	return { added, failed, notesFailed };
}
