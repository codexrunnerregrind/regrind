import { getAlbumStorageLimits } from "$lib/api/messaging/albums";
import { albumMediaCounts } from "$lib/components/album/album";
import type {
	AlbumContent,
	AlbumStorageLimits,
} from "$lib/model/messaging/albums";

/**
 * What an album still has room for.
 *
 * The API refuses an item over a cap with a bare `400 unknown error`, so the
 * caps are read once the album is open and the header says what is left instead
 * of leaving an add to be turned away opaquely. A read that fails simply never
 * arrives: `remaining` stays null and nothing is claimed.
 */
export class AlbumLimits {
	#limits = $state<AlbumStorageLimits | null>(null);
	#reading = false;

	get limits(): AlbumStorageLimits | null {
		return this.#limits;
	}

	async read(): Promise<void> {
		if (this.#limits !== null || this.#reading) return;
		this.#reading = true;
		try {
			this.#limits = await getAlbumStorageLimits();
		} catch (error) {
			console.error(error);
		} finally {
			this.#reading = false;
		}
	}

	/** Items left in the album, and how many of those may still be clips. */
	remaining(
		content: readonly Pick<AlbumContent, "contentType">[],
	): { items: number; videos: number } | null {
		const limits = this.#limits;
		if (limits === null) return null;
		const { photos, videos } = albumMediaCounts({ content, pending: [] });
		const items = Math.max(
			0,
			limits.maxContentItemsPerAlbum - photos - videos,
		);
		// A clip still takes an item, so a free video slot in a full album is no
		// room at all.
		return {
			items,
			videos: Math.min(
				items,
				Math.max(0, limits.maxVideosPerAlbum - videos),
			),
		};
	}
}
