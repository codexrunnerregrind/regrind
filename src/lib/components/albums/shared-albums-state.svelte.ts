import { getSharedAlbumsFeed } from "$lib/api/messaging/albums";
import { now } from "$lib/util/clock";
import type { PressieSharedAlbum } from "$lib/model/messaging/albums";

/**
 * The "shared with me" feed, cached outside the component tree.
 *
 * The Albums tab is unmounted whenever the inbox swipes back to Messages, so a
 * component-local fetch made every swipe a fresh request and a fresh skeleton.
 * The list lives here instead: the first visit loads it, later visits render the
 * cached albums immediately and only revalidate in the background once the copy
 * is old. Pull to refresh is the way to force one.
 */
const FRESH_TTL_MS = 60_000;

export class SharedAlbumsState {
	albums = $state<PressieSharedAlbum[] | null>(null);
	/** Only set while there is nothing cached to show instead. */
	error = $state<unknown>(null);
	/** A refresh over albums we are already showing. */
	refreshing = $state(false);

	#fetchedAt = 0;
	#inFlight: Promise<void> | null = null;

	get #stale(): boolean {
		return now() - this.#fetchedAt >= FRESH_TTL_MS;
	}

	/**
	 * Called on every mount of the grid. Fetches when we have nothing, quietly
	 * revalidates when what we have has aged out, and does nothing otherwise.
	 */
	ensureLoaded(): void {
		if (this.albums === null || this.#stale) void this.#fetch();
	}

	/** Pull to refresh, and the retry on the error state: always refetches. */
	refresh(): Promise<void> {
		return this.#fetch();
	}

	/** Clears the unseen dot locally, so opening an album settles it right away. */
	markSeen(albumId: number): void {
		const album = this.albums?.find((it) => it.albumId === albumId);
		if (album?.hasUnseenContent) album.hasUnseenContent = false;
	}

	#fetch(): Promise<void> {
		// Two mounts in a row (or a pull landing on top of a revalidate) share the
		// one request rather than racing to overwrite each other's result.
		this.#inFlight ??= this.#load().finally(() => {
			this.#inFlight = null;
		});
		return this.#inFlight;
	}

	async #load(): Promise<void> {
		if (this.albums !== null) this.refreshing = true;
		try {
			const { sharedAlbums } = await getSharedAlbumsFeed();
			this.albums = sharedAlbums;
			this.error = null;
			this.#fetchedAt = now();
		} catch (error) {
			console.error(error);
			// A failed revalidate keeps the cached list on screen: replacing albums
			// you can still open with an error page is the worse of the two.
			if (this.albums === null) this.error = error;
		} finally {
			this.refreshing = false;
		}
	}
}

/** The app-wide instance. Tests construct their own. */
export const sharedAlbums = new SharedAlbumsState();
