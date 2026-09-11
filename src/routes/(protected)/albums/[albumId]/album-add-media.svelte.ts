import { toast } from "svelte-sonner";

import { showErrorToast } from "$lib/api/error-toast";
import {
	type AlbumContentResponse,
	getAlbumStorageLimits,
	uploadAlbumContent,
} from "$lib/api/messaging/albums";
import { clearMyAlbumsCache } from "$lib/chat/my-albums";
import { PhotoEditQueue } from "$lib/components/media/photo-edit-queue.svelte";
import { pickMultipleMedia } from "$lib/platform/media-picker";
import type { AlbumStorageLimits } from "$lib/model/messaging/albums";

type AlbumContent = AlbumContentResponse["content"];

/**
 * Adding photos to an album.
 *
 * Photos only: every clip uploaded to the album endpoint has come back corrupt
 * or stuck in `processing` forever — the official client shows the same — and a
 * stuck item locks the album's delete and reorder too. Playback of a clip
 * already in an album is untouched; only adding one is off.
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
			content: () => AlbumContent;
			/** A move or a deletion is in flight, so an add may not start. */
			busy: () => boolean;
			reload: () => Promise<void>;
		},
	) {}

	async add() {
		if (this.adding || this.album.busy() || this.edits.current !== null)
			return;
		const picked = await pickMultipleMedia("image");
		if (picked.length === 0) return;

		const albumId = this.album.id();
		const held = this.album.content().length;
		// Read for every add, not only for a clip: the item cap refuses a photo
		// as opaquely as a clip, and a full album is the likelier refusal.
		const limits = await albumLimits();
		const fits = roomInAlbum(limits, held);
		if (fits <= 0) {
			toast.error(fullAlbumMessage(limits));
			return;
		}
		// What is over the cap is dropped rather than offered and refused.
		if (picked.length > fits)
			toast.info(
				`Room for ${fits} more item${fits === 1 ? "" : "s"} — the rest were left out.`,
			);
		const taking = picked.slice(0, fits);

		let added = 0;
		try {
			// Each photo is framed before it goes up, and the one after it only
			// opens once this one has landed.
			for await (const photo of this.edits.edit(taking)) {
				this.adding = true;
				// One request per photo — the endpoint takes a single part.
				await uploadAlbumContent({ albumId, ...photo });
				added += 1;
				this.adding = false;
			}
		} catch (err) {
			console.error(err);
			showErrorToast({ label: "Failed to add photos", error: err });
		} finally {
			this.adding = false;
		}

		if (added === 0) return;
		// The upload answers with the new content id alone, not with the
		// thumbnail the grid draws, so the album is re-read rather than patched.
		// The bubbles that shared it read their cover from our own album list,
		// which is now a photo behind.
		clearMyAlbumsCache();
		await this.album.reload();
		toast.success(added === 1 ? "Photo added" : `${added} photos added`);
	}
}

/** How many more items the album may hold, `Infinity` if no cap was read. */
function roomInAlbum(limits: AlbumStorageLimits | null, held: number): number {
	return (limits?.maxContentItemsPerAlbum ?? Infinity) - held;
}

function fullAlbumMessage(limits: AlbumStorageLimits | null): string {
	const cap = limits?.maxContentItemsPerAlbum ?? null;
	return cap === null
		? "This album is full."
		: `This album is full — it holds ${cap} item${cap === 1 ? "" : "s"}.`;
}

/** The account's album limits, or `null` if they could not be read. */
async function albumLimits(): Promise<AlbumStorageLimits | null> {
	try {
		return await getAlbumStorageLimits();
	} catch (err) {
		// Not fatal: without them a photo is simply offered to the API, which
		// is what happened before the limits were read at all.
		console.error(err);
		return null;
	}
}
