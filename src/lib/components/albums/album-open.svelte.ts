import { toast } from "svelte-sonner";

import { showErrorToast } from "$lib/api/error-toast";
import {
	AlbumLockedError,
	type AlbumSharer,
	loadAlbum,
	openAlbumLightbox,
} from "$lib/chat/album-viewer";
import { hapticImpact } from "$lib/platform/haptics";

// Shared "tap an album cover → load its content → open the PhotoSwipe viewer"
// behaviour, used by both the my-albums and shared-with-me grids. Tracks which
// album is currently loading so the grid can show a pending state and block
// concurrent opens.
export class AlbumOpener {
	openingId = $state<number | null>(null);

	/**
	 * `sharer` marks the album as somebody else's and describes them for the
	 * viewer's header; leaving it out opens our own album with no reply chrome.
	 */
	async open(albumId: number, sharer?: AlbumSharer) {
		if (this.openingId !== null) return;
		this.openingId = albumId;
		hapticImpact("light");
		try {
			const album = await loadAlbum(albumId);
			await openAlbumLightbox(album, { sharer });
		} catch (error) {
			if (error instanceof AlbumLockedError) {
				toast.info(error.message);
			} else {
				console.error(error);
				showErrorToast({ label: "Failed to open album", error });
			}
		} finally {
			this.openingId = null;
		}
	}
}
