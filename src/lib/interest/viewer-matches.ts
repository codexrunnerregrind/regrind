import { decode, encode } from "@msgpack/msgpack";
import z from "zod";

import {
	existsAppDataFile,
	readAppDataFile,
	removeAppDataFile,
	writeAppDataFileAtomic,
} from "$lib/app-data";
import { preferencesAccount } from "$lib/app-data/preferences.svelte";
import { now } from "$lib/util/clock";

// Puts blurred Viewed Me previews back to a face: by the photo hash they still
// carry, else by their view time against the live view events we saw.

// A few grid pages hold hundreds of photos, so the cap is sized for a month of
// browsing rather than an hour of it (~1 MB on disk).
const MAX_PHOTOS = 10_000;
const MAX_VIEWS = 1000;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const VIEW_TOLERANCE_MS = 2000;
// The real save is when the app goes to the background; this only bounds what
// a crash while open can lose.
const SAVE_DELAY_MS = 60_000;

const entrySchema = z.object({
	profileId: z.int().nonnegative(),
	displayName: z.string().nullable(),
	seenAt: z.number(),
});

export type ViewerMatch = z.infer<typeof entrySchema>;

const viewSchema = z.object({
	profileId: z.int().nonnegative(),
	at: z.number(),
});

type SeenView = z.infer<typeof viewSchema>;

const fileSchema = z
	.object({
		photos: z.record(z.string(), entrySchema).catch({}),
		views: z.array(viewSchema).catch([]),
	})
	.catch({ photos: {}, views: [] });

export type SeenPhoto = {
	profileId: number;
	hash: string | null | undefined;
	displayName?: string | null | undefined;
};

let loadedFor: number | null = null;
let photos = new Map<string, ViewerMatch>();
let views: SeenView[] = [];
let loading: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
// In memory but not on disk yet. A seen-again profile only refreshes its age,
// which rides along with the next save instead of causing one.
let unsaved = false;
// Set when the file was there but couldn't be read: saving over it would
// replace a month of sightings with this session's.
let readFailed = false;

if (typeof document !== "undefined") {
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden") flush();
	});
}

function path(profileId: number): string {
	return `viewer-matches.${profileId}.data`;
}

function prune(): void {
	const cutoff = now() - MAX_AGE_MS;
	photos = new Map(
		[...photos]
			.filter(([, entry]) => entry.seenAt >= cutoff)
			.sort(([, a], [, b]) => b.seenAt - a.seenAt)
			.slice(0, MAX_PHOTOS),
	);
	views = views
		.filter((view) => view.at >= cutoff)
		.sort((a, b) => b.at - a.at)
		.slice(0, MAX_VIEWS);
}

async function load(): Promise<number | null> {
	const account = preferencesAccount();
	if (account === null) return null;
	if (loadedFor === account) return account;
	flush();
	loading ??= (async () => {
		let read: z.infer<typeof fileSchema> = { photos: {}, views: [] };
		let failed = false;
		try {
			if (await existsAppDataFile(path(account))) {
				read = fileSchema.parse(
					decode(await readAppDataFile(path(account))),
				);
			}
		} catch (error) {
			console.error(error);
			failed = true;
		}
		if (preferencesAccount() !== account) return;
		readFailed = failed;
		photos = new Map(Object.entries(read.photos));
		views = read.views;
		loadedFor = account;
		prune();
	})().finally(() => {
		loading = null;
	});
	await loading;
	return loadedFor === account ? account : null;
}

function save(account: number): void {
	if (readFailed) return;
	unsaved = false;
	prune();
	void writeAppDataFileAtomic({
		path: path(account),
		content: encode({ photos: Object.fromEntries(photos), views }),
	}).catch((error: unknown) => console.error(error));
}

// Not pushed back by later changes, so a long session still saves.
function scheduleSave(account: number): void {
	if (saveTimer !== null) return;
	saveTimer = setTimeout(() => {
		saveTimer = null;
		if (loadedFor === account) save(account);
	}, SAVE_DELAY_MS);
}

/** Saves now, if anything is unsaved: on an account switch, or as the app goes to the background. */
function flush(): void {
	if (saveTimer !== null) clearTimeout(saveTimer);
	saveTimer = null;
	if (unsaved && loadedFor !== null) save(loadedFor);
}

/** Remembers whose photo each hash is. Newest sighting wins. */
export async function rememberPhotos(seen: SeenPhoto[]): Promise<void> {
	if (seen.length === 0) return;
	const account = await load();
	if (account === null) return;
	const at = now();
	let learned = false;
	for (const { profileId, hash, displayName } of seen) {
		if (!hash) continue;
		const prev = photos.get(hash);
		const name =
			displayName ??
			(prev?.profileId === profileId ? prev.displayName : null);
		learned ||= prev?.profileId !== profileId || prev.displayName !== name;
		photos.set(hash, { profileId, displayName: name, seenAt: at });
		unsaved = true;
	}
	if (learned) scheduleSave(account);
}

/** Remembers who viewed us when, from a live view event. */
export async function rememberView(view: SeenView): Promise<void> {
	const account = await load();
	if (account === null) return;
	if (views.some((v) => v.profileId === view.profileId && v.at === view.at))
		return;
	views = [view, ...views];
	unsaved = true;
	scheduleSave(account);
}

/** Fire-and-forget forms for call sites that must not wait or fail. */
export function notePhotos(seen: SeenPhoto[]): void {
	void rememberPhotos(seen).catch((error: unknown) => console.error(error));
}

export function noteView(view: SeenView): void {
	void rememberView(view).catch((error: unknown) => console.error(error));
}

function matchByPhoto(hash: string | null, cutoff: number): ViewerMatch | null {
	const entry = hash ? photos.get(hash) : undefined;
	return entry && entry.seenAt >= cutoff ? entry : null;
}

// Only when every view near that time is the same profile: two viewers seconds
// apart can't be told apart.
function matchByViewTime(
	at: number | null,
	cutoff: number,
	names: () => Map<number, string>,
): ViewerMatch | null {
	if (at === null) return null;
	const near = new Set(
		views
			.filter(
				(view) =>
					view.at >= cutoff &&
					Math.abs(view.at - at) <= VIEW_TOLERANCE_MS,
			)
			.map((view) => view.profileId),
	);
	const [profileId] = near;
	if (profileId === undefined || near.size !== 1) return null;
	return {
		profileId,
		displayName: names().get(profileId) ?? null,
		seenAt: at,
	};
}

/** Each profile's most recently seen name, built on first use per call. */
function nameIndex(): () => Map<number, string> {
	let index: Map<number, string> | null = null;
	return () => {
		if (index) return index;
		const built = new Map<number, { name: string; seenAt: number }>();
		for (const { profileId, displayName, seenAt } of photos.values()) {
			if (displayName === null) continue;
			const known = built.get(profileId);
			if (!known || known.seenAt < seenAt)
				built.set(profileId, { name: displayName, seenAt });
		}
		index = new Map([...built].map(([id, { name }]) => [id, name]));
		return index;
	};
}

export async function matchViewers(
	previews: { hash: string | null; lastViewed: number | null }[],
): Promise<(ViewerMatch | null)[]> {
	if ((await load()) === null) {
		return previews.map(() => null);
	}
	const cutoff = now() - MAX_AGE_MS;
	const names = nameIndex();
	return previews.map(
		({ hash, lastViewed }) =>
			matchByPhoto(hash, cutoff) ??
			matchByViewTime(lastViewed, cutoff, names),
	);
}

export async function clearViewerMatches(profileId: number): Promise<void> {
	if (loadedFor === profileId) {
		if (saveTimer !== null) clearTimeout(saveTimer);
		saveTimer = null;
		readFailed = false;
		unsaved = false;
		photos = new Map();
		views = [];
		loadedFor = null;
	}
	await removeAppDataFile(path(profileId));
}

export function resetViewerMatchesForTesting(): void {
	if (saveTimer !== null) clearTimeout(saveTimer);
	saveTimer = null;
	loadedFor = null;
	loading = null;
	readFailed = false;
	unsaved = false;
	photos = new Map();
	views = [];
}
