import { getAlbumsPaywallContent } from "$lib/api/messaging/albums";
import { now } from "$lib/util/clock";

/**
 * Blurred cover previews for albums we are not entitled to open.
 *
 * A locked or expired share still appears in the paywall teaser with media
 * urls (see {@link getAlbumsPaywallContent}), so a locked bubble can show what
 * the official app's upsell shows instead of a bare lock plate. The album
 * message carries a `coverUrl` of its own, but its CDN signature is stamped at
 * send time and lasts about half an hour, so a share from this morning has
 * nothing loadable left on it — this is where a fresh url comes from.
 *
 * Fetched per counterparty rather than per album: one request answers for every
 * album that profile shared, and a conversation usually shows several bubbles
 * for the same one.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;

type CoversByAlbum = Map<number, string>;
type Cached = { at: number; covers: CoversByAlbum };

// Owner id `0` stands for the unfiltered request — the retry for a bubble that
// never learned whose album it was.
const ANY_OWNER = 0;

const cache = new Map<number, Cached>();
const inFlight = new Map<number, Promise<Cached>>();

async function fetchCovers(ownerProfileId: number): Promise<Cached> {
	const entries = await getAlbumsPaywallContent(
		ownerProfileId === ANY_OWNER ? null : ownerProfileId,
	);
	const covers: CoversByAlbum = new Map();
	for (const entry of entries) {
		// `paywallUrls` leads with the cover, so it stands in when the dedicated
		// field is missing.
		const url = entry.paywallCoverUrl ?? entry.paywallUrls?.[0] ?? null;
		if (url === null || !url.startsWith("https://")) continue;
		covers.set(entry.albumId, url);
	}
	return { at: now(), covers };
}

function load(ownerProfileId: number): Promise<Cached> {
	const cached = cache.get(ownerProfileId);
	if (cached !== undefined && now() - cached.at < CACHE_TTL_MS)
		return Promise.resolve(cached);
	let pending = inFlight.get(ownerProfileId);
	if (pending === undefined) {
		pending = fetchCovers(ownerProfileId)
			.then((fetched) => {
				cache.set(ownerProfileId, fetched);
				return fetched;
			})
			.finally(() => {
				inFlight.delete(ownerProfileId);
			});
		inFlight.set(ownerProfileId, pending);
	}
	return pending;
}

/**
 * A loadable blurred cover for a locked album, or `null` when the teaser has
 * nothing for it — the genuinely-gone case the lock plate is for.
 *
 * Asks for the owner's albums first and falls back to the unfiltered teaser,
 * mirroring {@link loadPaywallAlbum}: the narrow response is the small one, and
 * the wide one is what answers when the album is not in it.
 */
export async function paywallCoverUrl({
	albumId,
	ownerProfileId,
}: {
	albumId: number;
	ownerProfileId?: number | null;
}): Promise<string | null> {
	const owners =
		ownerProfileId === undefined ||
		ownerProfileId === null ||
		ownerProfileId === ANY_OWNER
			? [ANY_OWNER]
			: [ownerProfileId, ANY_OWNER];
	for (const owner of owners) {
		const { covers } = await load(owner);
		const url = covers.get(albumId);
		if (url !== undefined) return url;
	}
	return null;
}

export function clearPaywallCoverCache(): void {
	cache.clear();
	inFlight.clear();
}
