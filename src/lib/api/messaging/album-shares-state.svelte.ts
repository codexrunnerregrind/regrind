import { SvelteMap } from "svelte/reactivity";

import { now } from "$lib/util/clock";

/**
 * What we know about whether a given album is shared with a given profile.
 *
 * The API has no endpoint answering "is this album shared with this profile",
 * and a chat message is a snapshot from when it was sent — it does not change
 * when a share is revoked. So the surfaces that share and unshare record what
 * they did here, and the ones that only need to know read it back.
 *
 * Absent means "unknown", which callers should treat as "possibly shared"
 * rather than "not shared".
 */
const shareState = new SvelteMap<string, boolean>();

function key(albumId: number, profileId: number): string {
	return `${albumId}:${profileId}`;
}

export function setAlbumShared(
	albumId: number,
	profileId: number,
	shared: boolean,
): void {
	shareState.set(key(albumId, profileId), shared);
}

/** `true` / `false` when known, `undefined` when we have never checked. */
export function getAlbumShared(
	albumId: number,
	profileId: number,
): boolean | undefined {
	return shareState.get(key(albumId, profileId));
}

/**
 * Answering "which albums are shared with this profile" costs a request per
 * album, so a sweep is remembered for a while rather than repeated every time
 * the composer is opened.
 */
const SWEEP_TTL_MS = 60_000;

const sweptAt = new SvelteMap<number, number>();

export function sharesSweptRecently(profileId: number): boolean {
	const at = sweptAt.get(profileId);
	return at !== undefined && now() - at < SWEEP_TTL_MS;
}

export function markSharesSwept(profileId: number): void {
	sweptAt.set(profileId, now());
}

export function clearAlbumShareState(): void {
	shareState.clear();
	sweptAt.clear();
}
