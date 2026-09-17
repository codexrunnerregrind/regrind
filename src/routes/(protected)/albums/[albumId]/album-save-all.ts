import { downloadAllMedia } from "$lib/chat/lightbox-download";
import { hapticImpact } from "$lib/platform/haptics";
import type { AlbumContentResponse } from "$lib/api/messaging/albums";

/**
 * Saves every item in the album to the device, named after `profileId` where
 * the album's owner is known. A processing item is skipped:
 * the API serves nothing at its URL until the transcode is done, so it would
 * only be a failed download among the good ones.
 */
export async function saveAlbumMedia(
	content: AlbumContentResponse["content"],
	profileId: number | null = null,
) {
	const ready = content.filter((item) => item.processing !== true);
	if (ready.length === 0) return;
	hapticImpact("light");
	await downloadAllMedia(
		ready.map((item) => ({
			url: item.url,
			mimeType: item.contentType,
			profileId,
		})),
	);
}
