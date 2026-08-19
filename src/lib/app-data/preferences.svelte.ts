import { decode, encode } from "@msgpack/msgpack";
import { toast } from "svelte-sonner";
import z from "zod";

import {
	gridSearchFiltersSchema,
	rightNowFiltersSchema,
} from "$lib/model/browse/grid/filters";
import { geohashSchema } from "$lib/model/geohash";
import {
	type SavedLocation,
	savedLocationSchema,
} from "$lib/model/saved-location";
import { type UnitSystem, unitSystemSchema } from "$lib/util/units";
import {
	existsAppDataFile,
	readAppDataFile,
	removeAppDataFile,
	writeAppDataFileAtomic,
} from ".";
import {
	type AccentColor,
	accentColors,
	type BubbleColor,
	bubbleColors,
} from "./palette";

export const themeModeSchema = z.enum(["light", "dark", "system"]);
export type ThemeMode = z.infer<typeof themeModeSchema>;

export const accentColorSchema = z.enum(accentColors);

/** How many columns a grid shows at phone width. */
export const gridColumnsSchema = z.union([z.literal(2), z.literal(3)]);
export type GridColumns = z.infer<typeof gridColumnsSchema>;
export const bubbleColorSchema = z.enum(bubbleColors);

const preferencesSchema = z.object({
	// Defaults mirror the official app: yellow for the accent and your own
	// messages, pale sky blue for theirs. `.catch` keeps a color that has since
	// been dropped from the palette from failing the whole parse — the file would
	// otherwise be reported as corrupt and offer to reset every preference.
	accentColor: accentColorSchema.default("yellow").catch("yellow"),
	// Bubble colors are independent of the app accent: the accent drives
	// controls, while these only affect the chat transcript.
	outgoingBubbleColor: bubbleColorSchema.default("yellow").catch("yellow"),
	incomingBubbleColor: bubbleColorSchema.default("sky").catch("sky"),
	// The manually-picked ("mock") location. Preserved across mode switches so
	// returning from current-location mode restores the last picked spot.
	geohash: geohashSchema.nullable().default(null),
	// The last detected live GPS location, used while `usingCurrentLocation` is
	// true. Kept separate from `geohash` so switching modes never clobbers the
	// user's mock pick.
	currentGeohash: geohashSchema.nullable().default(null),
	// Which of the two locations above is active. When true the grid follows the
	// device (refresh re-detects); when false it stays on the mock `geohash`.
	usingCurrentLocation: z.boolean().default(false),
	// Favorites and history for the map picker, so a spot can be picked again
	// without hunting for it. `.catch` keeps a malformed entry from failing the
	// whole parse and offering to reset every preference.
	savedLocations: z.array(savedLocationSchema).default([]).catch([]),
	gridSearchFilters: gridSearchFiltersSchema.optional(),
	notifyMessages: z.boolean().default(true),
	notifyTaps: z.boolean().default(true),
	revealMessageRead: z.boolean().default(false),
	revealProfileViews: z.boolean().default(false),
	// Dark rather than "system": the redesign is drawn dark-first, and a
	// location-based app is mostly used at night. Both themes are fully
	// specified, so switching to light or back to system is one tap away.
	themeMode: themeModeSchema.default("dark"),
	// Three across is the redesign's default; two trades reach for bigger tiles.
	// Wider screens step up from whichever of the two the user picked. Profiles
	// and albums are set apart because they are browsed differently — faces are
	// scanned in bulk, album covers are picked one at a time.
	profileGridColumns: gridColumnsSchema.default(3).catch(3),
	albumGridColumns: gridColumnsSchema.default(3).catch(3),
	units: unitSystemSchema.default("metric"),
	rightNowFilters: rightNowFiltersSchema.optional(),
});

type Preferences = z.infer<typeof preferencesSchema>;

let writeQueue: Promise<unknown> = Promise.resolve();
let snapshot = $state<Preferences>(preferencesSchema.parse({}));
let loaded = $state(false);

function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
	const run = writeQueue.then(task);
	writeQueue = run.then(
		() => undefined,
		() => undefined,
	);
	return run;
}

let cache: Preferences | null = null;
let hydrating: Promise<Preferences> | null = null;

function publish(preferences: Preferences): void {
	cache = preferences;
	snapshot = preferences;
	loaded = true;
}

async function readFromDisk(): Promise<Preferences> {
	if (!(await existsAppDataFile("preferences.data"))) {
		return preferencesSchema.parse({});
	}
	const bytes = await readAppDataFile("preferences.data");
	return preferencesSchema.parse(decode(bytes));
}

export async function getPreferences(): Promise<Preferences> {
	if (cache !== null) return structuredClone(cache);
	hydrating ??= readFromDisk()
		.then((preferences) => {
			publish(preferences);
			return preferences;
		})
		.catch((error: unknown) => {
			console.error(error);
			toast.error("Failed to load preferences. Reset to defaults?", {
				action: {
					label: "Reset",
					onClick: () => void resetToDefaults(),
				},
				duration: 10000,
				id: "load-preferences-error",
			});
			throw error;
		})
		.finally(() => {
			hydrating = null;
		});
	return structuredClone(await hydrating);
}

export function getPreferencesSnapshot(): Preferences {
	return snapshot;
}

export function preferencesLoaded(): boolean {
	return loaded;
}

/** The manually-picked ("mock") location, whether or not it is in use. */
export function getGeohashSnapshot(): string | null {
	return snapshot.geohash;
}

export function getCurrentGeohashSnapshot(): string | null {
	return snapshot.currentGeohash;
}

export function getUsingCurrentLocationSnapshot(): boolean {
	return snapshot.usingCurrentLocation;
}

/** The location the grid should actually use, per the current mode. */
export function getActiveGeohashSnapshot(): string | null {
	return snapshot.usingCurrentLocation
		? snapshot.currentGeohash
		: snapshot.geohash;
}

export function getSavedLocationsSnapshot(): SavedLocation[] {
	return snapshot.savedLocations;
}

export function getUnitsSnapshot(): UnitSystem {
	return snapshot.units;
}

export function getThemeModeSnapshot(): ThemeMode {
	return snapshot.themeMode;
}

/** Grids of people: the browse grid and profile views. */
export function getProfileGridColumnsSnapshot(): GridColumns {
	return snapshot.profileGridColumns;
}

/** Grids of albums and of the photos inside them. */
export function getAlbumGridColumnsSnapshot(): GridColumns {
	return snapshot.albumGridColumns;
}

export function getAccentColorSnapshot(): AccentColor {
	return snapshot.accentColor;
}

export function getOutgoingBubbleColorSnapshot(): BubbleColor {
	return snapshot.outgoingBubbleColor;
}

export function getIncomingBubbleColorSnapshot(): BubbleColor {
	return snapshot.incomingBubbleColor;
}

export async function hydratePreferences(): Promise<void> {
	await getPreferences();
}

export async function setPreferences(
	newValues: Partial<Preferences>,
): Promise<void> {
	await enqueueWrite(async () => {
		const oldValues = await getPreferences();
		const preferences = preferencesSchema.parse({
			...oldValues,
			...newValues,
		});
		await writeAppDataFileAtomic({
			path: "preferences.data",
			content: encode(preferences),
		});
		publish(preferences);
	});
}

async function resetToDefaults(): Promise<void> {
	await enqueueWrite(async () => {
		const preferences = preferencesSchema.parse({});
		await writeAppDataFileAtomic({
			path: "preferences.data",
			content: encode(preferences),
		});
		publish(preferences);
	});
	window.location.reload();
}

const accountPreferenceKeys = [
	"geohash",
	"currentGeohash",
	"usingCurrentLocation",
	"gridSearchFilters",
] as const;

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
	return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

export async function clearAccountPreferences(): Promise<void> {
	await enqueueWrite(async () => {
		const kept: Partial<Preferences> = { ...(await getPreferences()) };
		for (const key of accountPreferenceKeys) delete kept[key];
		const preferences = preferencesSchema.parse(kept);
		publish(preferences);
		const encoded = encode(preferences);
		if (bytesEqual(encoded, encode(preferencesSchema.parse({})))) {
			await removeAppDataFile("preferences.data");
		} else {
			await writeAppDataFileAtomic({
				path: "preferences.data",
				content: encoded,
			});
		}
	});
}
