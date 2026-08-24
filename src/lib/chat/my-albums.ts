import { registerAccountCache } from "$lib/api/account-caches";
import { getMyAlbums } from "$lib/api/messaging/albums";
import { now } from "$lib/util/clock";
import type { MyAlbum } from "$lib/model/messaging/albums";

/**
 * Our own albums, for the chat bubbles that shared them.
 *
 * A bubble of ours reads as locked once the share is revoked or has run out —
 * but that is the recipient's side of it. The album is still ours, so it comes
 * from our own album list rather than from the share: `GET /v2/albums/{id}` is
 * the entitled-viewer endpoint and answers a revoked share with nothing even
 * when the album is our own, while `GET /v1/albums` carries the whole thing.
 * The message's own `coverUrl` is only as good as the signature it was sent
 * with, so that is a stand-in, not the source.
 *
 * One request answers for every album we own, so every bubble in every
 * conversation shares it.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;

type AlbumsById = Map<number, MyAlbum>;
type Cached = { at: number; albums: AlbumsById };

let cached: Cached | null = null;
let inFlight: Promise<Cached> | null = null;

async function fetchAlbums(): Promise<Cached> {
	const albums: AlbumsById = new Map();
	for (const album of await getMyAlbums()) albums.set(album.albumId, album);
	return { at: now(), albums };
}

async function albums(): Promise<AlbumsById> {
	if (cached !== null && now() - cached.at < CACHE_TTL_MS)
		return cached.albums;
	inFlight ??= fetchAlbums()
		.then((fetched) => {
			cached = fetched;
			return fetched;
		})
		.finally(() => {
			inFlight = null;
		});
	return (await inFlight).albums;
}

/** One of our albums, whole, or `null` when we own no such album. */
export async function myAlbum(albumId: number): Promise<MyAlbum | null> {
	return (await albums()).get(albumId) ?? null;
}

/** Our album's cover, or `null` when we own no such album (or it is empty). */
export async function myAlbumCoverUrl(albumId: number): Promise<string | null> {
	const first = (await myAlbum(albumId))?.content[0];
	if (first === undefined) return null;
	const url = first.coverUrl ?? first.thumbUrl;
	return url.startsWith("https://") ? url : null;
}

export function clearMyAlbumsCache(): void {
	cached = null;
	inFlight = null;
}

// The list is one account's own albums, so it cannot outlive the account it was
// fetched for: switching accounts has to drop it or the next account's bubbles
// read from the previous one's albums until the TTL runs out.
registerAccountCache({ reset: clearMyAlbumsCache });
