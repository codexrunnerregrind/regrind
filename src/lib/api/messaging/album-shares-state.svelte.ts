import { SvelteMap } from "svelte/reactivity";

import { getAlbumShares } from "$lib/api/messaging/albums";
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

const sweptAt = new Map<number, number>();
const sweepsInFlight = new Map<number, Promise<void>>();

function sweptRecently(profileId: number): boolean {
	const at = sweptAt.get(profileId);
	return at !== undefined && now() - at < SWEEP_TTL_MS;
}

async function sweep(
	profileId: number,
	albums: readonly { albumId: number }[],
): Promise<void> {
	const outcomes = await Promise.all(
		albums.map(async (album) => {
			try {
				const profileIds = await getAlbumShares(album.albumId);
				setAlbumShared(
					album.albumId,
					profileId,
					profileIds.includes(profileId),
				);
				return true;
			} catch (error) {
				// Swallowed per album: not knowing leaves it looking unshared, which
				// is recoverable, whereas failing the sweep would block sharing.
				console.error(error);
				return false;
			}
		}),
	);
	// Only counts as swept if something actually landed, so a wholesale failure
	// (offline, say) retries instead of being cached as "checked".
	if (outcomes.some(Boolean)) sweptAt.set(profileId, now());
}

/**
 * Fills in which of `albums` are shared with `profileId`, skipping the work if
 * it was done recently. Concurrent callers share one sweep rather than each
 * firing a request per album.
 */
export function ensureAlbumSharesSwept(
	profileId: number,
	albums: readonly { albumId: number }[],
): Promise<void> {
	if (sweptRecently(profileId)) return Promise.resolve();
	let inFlight = sweepsInFlight.get(profileId);
	if (!inFlight) {
		inFlight = sweep(profileId, albums).finally(() => {
			sweepsInFlight.delete(profileId);
		});
		sweepsInFlight.set(profileId, inFlight);
	}
	return inFlight;
}

export function clearAlbumShareState(): void {
	shareState.clear();
	sweptAt.clear();
	sweepsInFlight.clear();
}
