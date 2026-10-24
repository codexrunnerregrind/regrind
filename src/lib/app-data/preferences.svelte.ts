import { decode, encode } from "@msgpack/msgpack";
import { toast } from "svelte-sonner";
import z from "zod";

import { backdropBlurCalibrationSchema } from "$lib/blur/calibration/decide";
import { backdropBlurQualitySchema } from "$lib/blur/quality";
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
	backdropBlurCalibration: backdropBlurCalibrationSchema
		.nullable()
		.default(null)
		.catch(null),
	backdropBlurQuality: backdropBlurQualitySchema
		.nullable()
		.default(null)
		.catch(null),
	// The manually-picked ("mock") location. Preserved across mode switches so
	// returning from current-location mode restores the last picked spot.
	geohash: geohashSchema.nullable().default(null),
	confirmBlock: z.boolean().default(true),
	giphyConsent: z.boolean().default(false),
	hapticFeedback: z.boolean().default(true),
	keepScreenOn: z.boolean().default(false),
	showAccountCreated: z.boolean().default(false),
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
	onboardingComplete: z.boolean().default(false),
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
	// The floating capsule, on by default. iOS draws it in the system glass
	// material; everywhere else it is a blur behind a tint, which is the same
	// shape and the same behaviour, only a plainer surface. Turning this off
	// returns the docked bar the redesign shipped with.
	navBarGlass: z.boolean().default(true),
	// The doodle wallpaper behind the transcript, on by default the way the
	// official app has one. Off leaves the plain chat background.
	chatWallpaper: z.boolean().default(true),
	stayOnline: z.boolean().default(true),
	units: unitSystemSchema.default("metric"),
	rightNowFilters: rightNowFiltersSchema.optional(),
});

type Preferences = z.infer<typeof preferencesSchema>;

export type BooleanPreference = {
	[Key in keyof Preferences]-?: Preferences[Key] extends boolean
		? Key
		: never;
}[keyof Preferences];

/**
 * The preferences that belong to one account rather than to the app.
 *
 * Location, filters and the account's own behaviour toggles follow the account:
 * a second account signed in on the same phone is somewhere else, looking for
 * something else, and may well not want to advertise that it is online. Look
 * and feel is deliberately not on this list — one app should not change colour
 * when you switch accounts.
 */
const accountPreferenceKeys = [
	"geohash",
	"currentGeohash",
	"usingCurrentLocation",
	"gridSearchFilters",
	"rightNowFilters",
	"stayOnline",
	"notifyMessages",
	"notifyTaps",
	"revealMessageRead",
	"revealProfileViews",
] as const;

const GLOBAL_PATH = "preferences.data";

function accountPath(profileId: number): string {
	return `preferences.${profileId}.data`;
}

function accountPart(values: Partial<Preferences>): Partial<Preferences> {
	return Object.fromEntries(
		accountPreferenceKeys
			.filter((key) => values[key] !== undefined)
			.map((key) => [key, values[key]]),
	);
}

function withoutAccountPart(
	values: Partial<Preferences>,
): Partial<Preferences> {
	const rest = { ...values };
	for (const key of accountPreferenceKeys) delete rest[key];
	return rest;
}

/**
 * Which account the account-scoped preferences above are being read and written
 * for. `null` before anyone is signed in, when everything lands in the global
 * file and is adopted by the first account to sign in.
 */
let accountId: number | null = null;

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

async function readFile(path: string): Promise<Partial<Preferences>> {
	if (!(await existsAppDataFile(path))) return {};
	const decoded = decode(await readAppDataFile(path));
	// Only the shape is checked here; the merged result is what gets parsed, so
	// a missing key in either file still falls back to its default.
	return decoded !== null && typeof decoded === "object" ? decoded : {};
}

/**
 * Moves an account's preferences out of the shared file the app wrote while it
 * could only hold one account.
 *
 * Without this the values would not just be stale, they would be inherited: a
 * second account signing in would open on the first account's location and
 * filters, because that is what the shared file still said.
 */
async function adoptGlobalAccountValues(
	profileId: number,
): Promise<Partial<Preferences>> {
	const stored = await readFile(GLOBAL_PATH);
	const mine = accountPart(stored);
	if (Object.keys(mine).length === 0) return {};
	await writeAppDataFileAtomic({
		path: accountPath(profileId),
		content: encode(mine),
	});
	await writeAppDataFileAtomic({
		path: GLOBAL_PATH,
		content: encode(withoutAccountPart(stored)),
	});
	return mine;
}

async function readFromDisk(): Promise<Preferences> {
	const stored = await readFile(GLOBAL_PATH);
	if (accountId === null) {
		// Nothing is signed in, so the account keys have nowhere of their own to
		// live yet and stay in the shared file until an account claims them.
		return preferencesSchema.parse(stored);
	}
	const path = accountPath(accountId);
	const mine = (await existsAppDataFile(path))
		? accountPart(await readFile(path))
		: await adoptGlobalAccountValues(accountId);
	return preferencesSchema.parse({ ...withoutAccountPart(stored), ...mine });
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

export function preferencesSnapshot(): Preferences {
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

export function getNavBarGlassSnapshot(): boolean {
	return snapshot.navBarGlass;
}

export function getChatWallpaperSnapshot(): boolean {
	return snapshot.chatWallpaper;
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

/**
 * Writes the snapshot out, each half to the file that owns it.
 *
 * `forAccount` is the account the values were read for, and the write is
 * abandoned if the app has switched since. Otherwise a setting changed just as
 * the switch landed would write the previous account's location and filters
 * into the new account's file.
 */
async function persist(
	preferences: Preferences,
	forAccount: number | null,
): Promise<boolean> {
	if (forAccount !== accountId) return false;
	if (forAccount === null) {
		await writeAppDataFileAtomic({
			path: GLOBAL_PATH,
			content: encode(preferences),
		});
		return true;
	}
	await writeAppDataFileAtomic({
		path: GLOBAL_PATH,
		content: encode(withoutAccountPart(preferences)),
	});
	await writeAppDataFileAtomic({
		path: accountPath(forAccount),
		content: encode(accountPart(preferences)),
	});
	return true;
}

export async function setPreferences(
	newValues: Partial<Preferences>,
): Promise<void> {
	await enqueueWrite(async () => {
		const forAccount = accountId;
		const oldValues = await getPreferences();
		const preferences = preferencesSchema.parse({
			...oldValues,
			...newValues,
		});
		if (await persist(preferences, forAccount)) publish(preferences);
	});
}

async function resetToDefaults(): Promise<void> {
	await enqueueWrite(async () => {
		const preferences = preferencesSchema.parse({});
		await persist(preferences, accountId);
		publish(preferences);
	});
	window.location.reload();
}

/**
 * Reads and writes preferences for this account from now on, re-reading what is
 * already on disk for it.
 *
 * Called with the signed-in profile before a protected route renders, and again
 * on every switch: the snapshot every screen reads is a single object, so it has
 * to be rebuilt from the new account's file before anything looks at it.
 */
export async function usePreferencesForAccount(
	profileId: number | null,
): Promise<void> {
	if (accountId === profileId && cache !== null) return;
	accountId = profileId;
	cache = null;
	hydrating = null;
	await getPreferences();
}

export function preferencesAccount(): number | null {
	return accountId;
}

/**
 * Forgets one account's preferences, on its way out. Everything shared with the
 * other accounts — the theme, the colours, the units — is left alone.
 */
export async function clearAccountPreferences(
	profileId: number | null = accountId,
): Promise<void> {
	await enqueueWrite(async () => {
		if (profileId !== null) await removeAppDataFile(accountPath(profileId));
		if (profileId !== accountId) return;
		accountId = null;
		const kept: Partial<Preferences> = withoutAccountPart(
			await getPreferences(),
		);
		const preferences = preferencesSchema.parse(kept);
		await writeAppDataFileAtomic({
			path: GLOBAL_PATH,
			content: encode(preferences),
		});
		publish(preferences);
	});
}
