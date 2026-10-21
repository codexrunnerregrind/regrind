import { decode, encode } from "@msgpack/msgpack";
import z from "zod";

import {
	existsAppDataFile,
	readAppDataFile,
	removeAppDataFile,
	writeAppDataFileAtomic,
} from "$lib/app-data";
import {
	getPreferences,
	preferencesAccount,
} from "$lib/app-data/preferences.svelte";
import { now } from "$lib/util/clock";

// Photo hash -> the profile last seen wearing it, so a blurred Viewed Me
// preview (which still carries the hash) can be put back to a face.

const MAX_ENTRIES = 1000;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const SAVE_DELAY_MS = 2000;

const entrySchema = z.object({
	profileId: z.int().nonnegative(),
	displayName: z.string().nullable(),
	seenAt: z.number(),
});

export type ViewerMatch = z.infer<typeof entrySchema>;

const fileSchema = z.record(z.string(), entrySchema).catch({});

export type SeenPhoto = {
	profileId: number;
	hash: string | null | undefined;
	displayName?: string | null | undefined;
};

let loadedFor: number | null = null;
let entries = new Map<string, ViewerMatch>();
let loading: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function path(profileId: number): string {
	return `viewer-matches.${profileId}.data`;
}

function prune(): void {
	const cutoff = now() - MAX_AGE_MS;
	const kept = [...entries]
		.filter(([, entry]) => entry.seenAt >= cutoff)
		.sort(([, a], [, b]) => b.seenAt - a.seenAt)
		.slice(0, MAX_ENTRIES);
	entries = new Map(kept);
}

async function load(): Promise<number | null> {
	const account = preferencesAccount();
	if (account === null) return null;
	if (loadedFor === account) return account;
	loading ??= (async () => {
		let read = new Map<string, ViewerMatch>();
		try {
			if (await existsAppDataFile(path(account))) {
				const decoded = fileSchema.parse(
					decode(await readAppDataFile(path(account))),
				);
				read = new Map(Object.entries(decoded));
			}
		} catch (error) {
			console.error(error);
		}
		if (preferencesAccount() !== account) return;
		entries = read;
		loadedFor = account;
		prune();
	})().finally(() => {
		loading = null;
	});
	await loading;
	return loadedFor === account ? account : null;
}

function scheduleSave(account: number): void {
	if (saveTimer !== null) clearTimeout(saveTimer);
	saveTimer = setTimeout(() => {
		saveTimer = null;
		if (loadedFor !== account) return;
		prune();
		void writeAppDataFileAtomic({
			path: path(account),
			content: encode(Object.fromEntries(entries)),
		}).catch((error: unknown) => console.error(error));
	}, SAVE_DELAY_MS);
}

async function enabled(): Promise<boolean> {
	return (await getPreferences()).matchHiddenViewers;
}

/** Remembers whose photo each hash is. Newest sighting wins. */
export async function rememberPhotos(seen: SeenPhoto[]): Promise<void> {
	if (seen.length === 0 || !(await enabled())) return;
	const account = await load();
	if (account === null) return;
	const at = now();
	for (const { profileId, hash, displayName } of seen) {
		if (!hash) continue;
		const prev = entries.get(hash);
		entries.set(hash, {
			profileId,
			displayName:
				displayName ??
				(prev?.profileId === profileId ? prev.displayName : null),
			seenAt: at,
		});
	}
	scheduleSave(account);
}

/** Fire-and-forget form for call sites that must not wait or fail. */
export function notePhotos(seen: SeenPhoto[]): void {
	void rememberPhotos(seen).catch((error: unknown) => console.error(error));
}

export async function matchPhotos(
	hashes: (string | null)[],
): Promise<(ViewerMatch | null)[]> {
	if (!(await enabled()) || (await load()) === null) {
		return hashes.map(() => null);
	}
	const cutoff = now() - MAX_AGE_MS;
	return hashes.map((hash) => {
		const entry = hash ? entries.get(hash) : undefined;
		return entry && entry.seenAt >= cutoff ? entry : null;
	});
}

export async function clearViewerMatches(profileId: number): Promise<void> {
	if (loadedFor === profileId) {
		entries = new Map();
		loadedFor = null;
	}
	await removeAppDataFile(path(profileId));
}

export function resetViewerMatchesForTesting(): void {
	if (saveTimer !== null) clearTimeout(saveTimer);
	saveTimer = null;
	loadedFor = null;
	loading = null;
	entries = new Map();
}
