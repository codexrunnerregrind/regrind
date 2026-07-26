import { decode, encode } from "@msgpack/msgpack";
import { toast } from "svelte-sonner";
import z from "zod";

import { gridSearchFiltersSchema, rightNowFiltersSchema } from "$lib/components/filters/filters";
import { geohashSchema } from "$lib/model/geohash";
import { type UnitSystem, unitSystemSchema } from "$lib/util/units";
import { existsAppDataFile, readAppDataFile, writeAppDataFileAtomic } from ".";

export const themeModeSchema = z.enum(["light", "dark", "system"]);
export type ThemeMode = z.infer<typeof themeModeSchema>;

export const accentColors = [
	"green",
	"teal",
	"blue",
	"indigo",
	"purple",
	"pink",
	"red",
	"orange",
	"yellow",
	"brown",
	"slate",
] as const;
export const accentColorSchema = z.enum(accentColors);
export type AccentColor = z.infer<typeof accentColorSchema>;

const preferencesSchema = z.object({
	accentColor: accentColorSchema.default("green"),
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
	gridSearchFilters: gridSearchFiltersSchema.optional(),
	notifyMessages: z.boolean().default(true),
	notifyTaps: z.boolean().default(true),
	revealMessageRead: z.boolean().default(false),
	revealProfileViews: z.boolean().default(false),
	themeMode: themeModeSchema.default("system"),
	units: unitSystemSchema.default("metric"),
	warnBeforeCopyingErrorDetails: z.boolean().default(true),
    rightNowFilters: rightNowFiltersSchema.optional(),
});

type Preferences = z.infer<typeof preferencesSchema>;

let writeQueue: Promise<unknown> = Promise.resolve();
let preferencesSnapshot = $state<Preferences>(preferencesSchema.parse({}));

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
			cache = preferences;
			preferencesSnapshot = preferences;
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

export function getUnitsSnapshot(): UnitSystem {
	return preferencesSnapshot.units;
}

export function getGeohashSnapshot(): string | null {
	return preferencesSnapshot.geohash;
}

export function getCurrentGeohashSnapshot(): string | null {
	return preferencesSnapshot.currentGeohash;
}

export function getUsingCurrentLocationSnapshot(): boolean {
	return preferencesSnapshot.usingCurrentLocation;
}

/** The location the grid should actually use, per the current mode. */
export function getActiveGeohashSnapshot(): string | null {
	return preferencesSnapshot.usingCurrentLocation
		? preferencesSnapshot.currentGeohash
		: preferencesSnapshot.geohash;
}

export function getThemeModeSnapshot(): ThemeMode {
	return preferencesSnapshot.themeMode;
}

export function getAccentColorSnapshot(): AccentColor {
	return preferencesSnapshot.accentColor;
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
		await writeAppDataFileAtomic("preferences.data", encode(preferences));
		cache = preferences;
		preferencesSnapshot = preferences;
	});
}

async function resetToDefaults(): Promise<void> {
	await enqueueWrite(async () => {
		const preferences = preferencesSchema.parse({});
		await writeAppDataFileAtomic("preferences.data", encode(preferences));
		cache = preferences;
		preferencesSnapshot = preferences;
	});
	window.location.reload();
}

const accountPreferenceKeys = [
	"geohash",
	"currentGeohash",
	"usingCurrentLocation",
	"gridSearchFilters",
] as const;

export async function clearAccountPreferences(): Promise<void> {
	await enqueueWrite(async () => {
		const kept: Partial<Preferences> = { ...(await getPreferences()) };
		for (const key of accountPreferenceKeys) delete kept[key];
		const preferences = preferencesSchema.parse(kept);
		await writeAppDataFileAtomic("preferences.data", encode(preferences));
		cache = preferences;
		preferencesSnapshot = preferences;
	});
}
