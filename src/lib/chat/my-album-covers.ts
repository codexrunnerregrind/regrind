import { getMyAlbums } from "$lib/api/messaging/albums";
import { now } from "$lib/util/clock";

/**
 * Covers for our own albums, for the chat bubbles that shared them.
 *
 * A bubble of ours reads as locked once the share is revoked or has run out —
 * but that is the recipient's side of it. The album is still ours, so its cover
 * is ours to show, and it comes from the album list rather than the message: the
 * message's own `coverUrl` is only as good as the signature it was sent with.
 *
 * One request answers for every album we own, so every bubble in every
 * conversation shares it.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;

type CoversByAlbum = Map<number, string>;
type Cached = { at: number; covers: CoversByAlbum };

let cached: Cached | null = null;
let inFlight: Promise<Cached> | null = null;

async function fetchCovers(): Promise<Cached> {
	const albums = await getMyAlbums();
	const covers: CoversByAlbum = new Map();
	for (const album of albums) {
		const first = album.content[0];
		if (first === undefined) continue;
		const url = first.coverUrl ?? first.thumbUrl;
		if (!url.startsWith("https://")) continue;
		covers.set(album.albumId, url);
	}
	return { at: now(), covers };
}

/** Our album's cover, or `null` when we own no such album (or it is empty). */
export async function myAlbumCoverUrl(albumId: number): Promise<string | null> {
	if (cached !== null && now() - cached.at < CACHE_TTL_MS)
		return cached.covers.get(albumId) ?? null;
	inFlight ??= fetchCovers()
		.then((fetched) => {
			cached = fetched;
			return fetched;
		})
		.finally(() => {
			inFlight = null;
		});
	const { covers } = await inFlight;
	return covers.get(albumId) ?? null;
}

export function clearMyAlbumCoverCache(): void {
	cached = null;
	inFlight = null;
}
