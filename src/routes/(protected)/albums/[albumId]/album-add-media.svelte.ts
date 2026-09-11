import { toast } from "svelte-sonner";

import { showErrorToast } from "$lib/api/error-toast";
import {
	type AlbumContentResponse,
	getAlbumStorageLimits,
	reorderAlbumContent,
	uploadAlbumContent,
} from "$lib/api/messaging/albums";
import { clearMyAlbumsCache } from "$lib/chat/my-albums";
import { PhotoEditQueue } from "$lib/components/media/photo-edit-queue.svelte";
import { pickMultipleMedia } from "$lib/platform/media-picker";
import type { AlbumStorageLimits } from "$lib/model/messaging/albums";

type AlbumContent = AlbumContentResponse["content"];

/**
 * Adding photos to an album, and putting the album back in the order the sender
 * left it.
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

	// The order the album should be in, kept until the API takes it. Ordering is
	// refused while an item is being transcoded — the same bare 400 a delete
	// gets — so an addition's order is retried once that has finished.
	#wantedOrder: number[] | null = null;

	constructor(
		readonly album: {
			id: () => number;
			content: () => AlbumContent;
			setContent: (content: AlbumContent) => void;
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
		// The order to put back afterwards: the API answers a fresh read with
		// the newest item first, which would make every addition the cover.
		const before = this.album.content().map((item) => item.contentId);
		// Read for every add, not only for a clip: the item cap refuses a photo
		// as opaquely as a clip, and a full album is the likelier refusal.
		const limits = await albumLimits();
		const fits = roomInAlbum(limits, before.length);
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
		await this.#appendNew(albumId, before);
		toast.success(added === 1 ? "Photo added" : `${added} photos added`);
	}

	/**
	 * Puts what was already in the album back in front of what was just added,
	 * so an addition lands at the end rather than taking the album's cover. The
	 * new ids come back newest first, so reversing them is the order they were
	 * uploaded in.
	 */
	async #appendNew(albumId: number, before: number[]) {
		const content = this.album.content();
		const added = content
			.map((item) => item.contentId)
			.filter((id) => !before.includes(id))
			.reverse();
		if (added.length === 0) return;

		const contentIds = [...before, ...added];
		const ordered = contentIds
			.map((id) => content.find((item) => item.contentId === id))
			.filter((item) => item !== undefined);
		// Every id the album holds has to be in hand for the API to take the
		// order, so a read that disagrees with it is left alone.
		if (ordered.length !== content.length) return;

		this.album.setContent(ordered);
		this.#wantedOrder = contentIds;
		await this.#sendOrder(albumId);
	}

	/**
	 * Retries an order the API would not take. Called after a re-read, which is
	 * what a transcode finishing looks like from here.
	 */
	settleOrder(albumId: number) {
		if (this.#wantedOrder === null) return;
		void this.#sendOrder(albumId);
	}

	async #sendOrder(albumId: number) {
		const contentIds = this.#wantedOrder;
		if (contentIds === null) return;
		// An album that no longer holds exactly these items has moved on, and
		// the order in hand is stale rather than pending.
		const held = this.album.content().map((item) => item.contentId);
		if (
			held.length !== contentIds.length ||
			!contentIds.every((id) => held.includes(id))
		) {
			this.#wantedOrder = null;
			return;
		}
		try {
			await reorderAlbumContent({ albumId, contentIds });
			this.#wantedOrder = null;
		} catch (err) {
			// Kept for the next attempt: the media is added either way, and an
			// order the API refuses today it takes once nothing is processing.
			console.error(err);
		}
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
