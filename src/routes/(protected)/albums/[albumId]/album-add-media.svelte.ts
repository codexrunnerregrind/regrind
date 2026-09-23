import { toast } from "svelte-sonner";

import { showErrorToast } from "$lib/api/error-toast";
import {
	type AlbumContentResponse,
	getAlbumStorageLimits,
	uploadAlbumContent,
	uploadAlbumPhotoBytes,
} from "$lib/api/messaging/albums";
import { clearMyAlbumsCache } from "$lib/chat/my-albums";
import { albumMediaCounts } from "$lib/components/album/album";
import { PhotoEditQueue } from "$lib/components/media/photo-edit-queue.svelte";
import { pickMultipleMedia } from "$lib/platform/media-picker";
import type { AlbumStorageLimits } from "$lib/model/messaging/albums";
import { inspectPicks, type Uploadable } from "./album-picks";

type AlbumContent = AlbumContentResponse["content"];

/**
 * Adding photos and clips to an album.
 *
 * A photo is framed here before it goes up, so what is uploaded never exists on
 * disk and has to travel as bytes. A clip is uploaded from the picker's own
 * handle instead — tens of megabytes of 4K never cross the IPC — and the album
 * then holds it in `processing` until Grindr has transcoded it, which the page
 * polls for.
 *
 * The page holds one of these: the picking, framing and uploading is a flow of
 * its own, and the album screen has enough to do drawing what came back.
 */
export class AlbumMediaAdder {
	/** An upload is in flight. The add tile spins on it. */
	adding = $state(false);
	/** The picks waiting to be framed, rendered by the editor drawer. */
	readonly edits = new PhotoEditQueue();

	constructor(
		readonly album: {
			id: () => number;
			profileId: () => number;
			content: () => AlbumContent;
			/** A move or a deletion is in flight, so an add may not start. */
			busy: () => boolean;
			reload: () => Promise<void>;
		},
	) {}

	async add() {
		if (this.adding || this.album.busy() || this.edits.current !== null)
			return;

		const albumId = this.album.id();
		const held = this.album.content();
		// Read before picking, not only for a clip: the item cap refuses a photo
		// as opaquely as a clip, and the picker is narrowed to photos when the
		// album has no room left for a clip.
		const limits = await albumLimits();
		const room = roomInAlbum(limits, held);
		if (room.items <= 0) {
			toast.error(fullAlbumMessage(limits));
			return;
		}

		const picked = await pickMultipleMedia(
			room.videos > 0 ? "media" : "image",
		);
		if (picked.length === 0) return;

		const uploadable = await inspectPicks(picked);
		if (uploadable.length === 0) return;

		const taking = withinRoom(uploadable, room);
		const leftOut = uploadable.length - taking.length;
		// What is over a cap is dropped rather than offered and refused.
		if (leftOut > 0) toast.info(leftOutMessage(uploadable, taking, limits));
		if (taking.length === 0) return;

		const photos = taking.filter(
			(pick) => pick.inspection.kind === "photo",
		);
		const videos = taking.filter(
			(pick) => pick.inspection.kind === "video",
		);

		let addedPhotos = 0;
		let addedVideos = 0;
		try {
			// Each photo is framed before it goes up, and the one after it only
			// opens once this one has landed.
			for await (const photo of this.edits.edit(
				photos.map((pick) => pick.media),
			)) {
				this.adding = true;
				// One request per item — the endpoint takes a single part.
				await uploadAlbumPhotoBytes({ albumId, ...photo });
				addedPhotos += 1;
				this.adding = false;
			}
			for (const clip of videos) {
				this.adding = true;
				await uploadAlbumContent({
					albumId,
					media: clip.media,
					inspection: clip.inspection,
					limits: {
						// Without the caps there is no size to enforce here, so
						// the body is left to the API to refuse. `Infinity` is
						// not a number the IPC can carry.
						maxContentSize:
							limits?.maxContentSize ?? Number.MAX_SAFE_INTEGER,
					},
					profileId: this.album.profileId(),
				});
				addedVideos += 1;
				this.adding = false;
			}
		} catch (err) {
			console.error(err);
			showErrorToast({ label: "Failed to add to album", error: err });
		} finally {
			this.adding = false;
		}

		// Reported from what landed rather than from what was picked: an upload
		// that threw half way through leaves the rest unsent.
		if (addedPhotos + addedVideos === 0) return;
		// The upload answers with the new content id alone, not with the
		// thumbnail the grid draws, so the album is re-read rather than patched.
		// The bubbles that shared it read their cover from our own album list,
		// which is now an item behind.
		clearMyAlbumsCache();
		await this.album.reload();
		toast.success(addedMessage(addedPhotos, addedVideos));
	}
}

/** Clips first: the video slot is the scarcer of the two. */
function withinRoom(
	uploadable: Uploadable[],
	room: { items: number; videos: number },
): Uploadable[] {
	const taking: Uploadable[] = [];
	let videosLeft = room.videos;
	for (const pick of [...uploadable].sort(
		(left, right) =>
			Number(right.inspection.kind === "video") -
			Number(left.inspection.kind === "video"),
	)) {
		if (taking.length >= room.items) break;
		if (pick.inspection.kind === "video") {
			if (videosLeft <= 0) continue;
			videosLeft -= 1;
		}
		taking.push(pick);
	}
	return taking;
}

/**
 * How much more the album may hold: items in total, and clips within that.
 * `Infinity` where no cap was read, which leaves the API to refuse it.
 */
function roomInAlbum(
	limits: AlbumStorageLimits | null,
	held: AlbumContent,
): { items: number; videos: number } {
	const { photos, videos } = albumMediaCounts({ content: held, pending: [] });
	return {
		items:
			(limits?.maxContentItemsPerAlbum ?? Infinity) - (photos + videos),
		videos: (limits?.maxVideosPerAlbum ?? Infinity) - videos,
	};
}

function fullAlbumMessage(limits: AlbumStorageLimits | null): string {
	const cap = limits?.maxContentItemsPerAlbum ?? null;
	return cap === null
		? "This album is full."
		: `This album is full — it holds ${cap} item${cap === 1 ? "" : "s"}.`;
}

function leftOutMessage(
	uploadable: Uploadable[],
	taking: Uploadable[],
	limits: AlbumStorageLimits | null,
): string {
	const clipsDropped =
		uploadable.filter((pick) => pick.inspection.kind === "video").length >
		taking.filter((pick) => pick.inspection.kind === "video").length;
	if (clipsDropped) {
		const cap = limits?.maxVideosPerAlbum ?? 1;
		return `An album holds ${cap} video${cap === 1 ? "" : "s"} — the rest were left out.`;
	}
	const fits = taking.length;
	return `Room for ${fits} more item${fits === 1 ? "" : "s"} — the rest were left out.`;
}

function addedMessage(photos: number, videos: number): string {
	if (videos === 0)
		return photos === 1 ? "Photo added" : `${photos} photos added`;
	if (photos === 0)
		return videos === 1 ? "Video added" : `${videos} videos added`;
	return `${photos + videos} items added`;
}

/** The account's album limits, or `null` if they could not be read. */
async function albumLimits(): Promise<AlbumStorageLimits | null> {
	try {
		return await getAlbumStorageLimits();
	} catch (err) {
		// Not fatal: without them an item is simply offered to the API, which
		// is what happened before the limits were read at all.
		console.error(err);
		return null;
	}
}
