import { toast } from "svelte-sonner";

import { ApiError } from "$lib/api/api-error";
import { showErrorToast } from "$lib/api/error-toast";
import {
	AlbumLockedError,
	type AlbumSharer,
	loadAlbum,
	loadPaywallAlbum,
	openAlbumLightbox,
} from "$lib/chat/album-viewer";
import { hapticImpact } from "$lib/platform/haptics";
import { announcePaywallTeaser } from "./paywall-teaser-toast";

// Shared "tap an album cover → load its content → open the PhotoSwipe viewer"
// behavior, used by both the my-albums and shared-with-me grids. Tracks which
// album is currently loading so the grid can show a pending state and block
// concurrent opens.
export class AlbumOpener {
	openingId = $state<number | null>(null);

	/**
	 * `sharer` marks the album as somebody else's and describes them for the
	 * viewer's header; leaving it out opens our own album with no reply chrome.
	 *
	 * `ownerProfileId` is only needed for albums that turn out to be locked or
	 * expired: it scopes the paywall teaser we fall back to (see
	 * {@link loadPaywallAlbum}).
	 */
	async open(
		albumId: number,
		sharer?: AlbumSharer,
		{
			ownerProfileId,
			albumName,
		}: { ownerProfileId?: number | null; albumName?: string | null } = {},
	) {
		if (this.openingId !== null) return;
		this.openingId = albumId;
		hapticImpact("light");
		try {
			let album = await loadAlbum(albumId).catch((error: unknown) => {
				// A 403 is the API's other way of saying "not for you"; both it and
				// an empty album below fall through to the teaser.
				if (!isForbidden(error)) throw error;
				return null;
			});
			// Locked and expired shares come back present but empty.
			let fromPaywall = false;
			if (album === null || album.content.length === 0) {
				// A teaser that errors out is still just an album we cannot show,
				// so it reports as locked rather than as a failure of its own.
				album = await loadPaywallAlbum({
					albumId,
					ownerProfileId,
					albumName,
				}).catch((error: unknown) => {
					console.error(error);
					return null;
				});
				if (album === null) throw new AlbumLockedError();
				fromPaywall = true;
			}
			// A paywall album carries no content ids to reply or react to, so it
			// opens without the sharer chrome that offers those.
			await openAlbumLightbox(album, {
				sharer: fromPaywall ? undefined : sharer,
			});
			if (fromPaywall) announcePaywallTeaser();
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

/** `GET /v2/albums/{albumId}` answers 403 for an album we have no access to. */
function isForbidden(error: unknown): boolean {
	return error instanceof ApiError && error.response?.status === 403;
}
