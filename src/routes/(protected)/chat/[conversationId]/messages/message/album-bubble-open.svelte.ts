import { toast } from "svelte-sonner";

import { showErrorToast } from "$lib/api/error-toast";
import {
	AlbumLockedError,
	type AlbumSharer,
	type LoadedAlbum,
	openAlbumLightbox,
	resolveAlbumForViewing,
} from "$lib/chat/album-viewer";
import { announcePaywallTeaser } from "$lib/components/albums/paywall-teaser-toast";
import { profileMediaUrl } from "$lib/util/media";
import { getConversationState } from "../../conversation-state.svelte";

/**
 * Opens the album an album reply or reaction points at, landing on the photo
 * that message is about. Construct one per bubble: it holds that bubble's
 * fetched album and tears the viewer down with the component, since the message
 * can scroll out of the list while the viewer is open.
 */
export class AlbumBubbleOpener {
	phase = $state<"idle" | "loading" | "open">("idle");

	#conversation = $derived(getConversationState()());
	// Reopening the same album shouldn't refetch it.
	#album: LoadedAlbum | null = null;
	// Set once the album came from the paywall teaser rather than the album
	// itself: those slides are synthesised, with no ids to reply or react to.
	#fromPaywall = false;
	#destroy: (() => void) | null = null;

	constructor() {
		$effect(() => () => {
			this.#destroy?.();
			this.#destroy = null;
		});
	}

	/**
	 * Someone else's album gets the viewer's reply chrome; our own opens bare.
	 * The conversation partner is the sharer, so their profile is what the
	 * header describes.
	 */
	#sharer(ownerProfileId: number | null): AlbumSharer | undefined {
		if (ownerProfileId === this.#conversation.ourProfileId)
			return undefined;
		const profile = this.#conversation.profile;
		return {
			name: profile?.name,
			avatarUrl:
				profile?.mediaHash === undefined || profile.mediaHash === null
					? null
					: profileMediaUrl({
							mediaHash: profile.mediaHash,
							size: "thumb",
						}),
			// The conversation profile reports metres, the viewer takes kilometres.
			distanceKm:
				profile?.distance === undefined || profile.distance === null
					? null
					: profile.distance / 1000,
		};
	}

	/**
	 * `contentId` opens on that photo rather than the album's first — an album
	 * reply or reaction is about one photo, so that is the one to land on.
	 */
	async open(
		albumId: number,
		options: { ownerProfileId: number | null; contentId?: number },
	) {
		if (this.phase !== "idle") return;
		this.phase = "loading";
		try {
			if (this.#album === null) {
				// The album a reply or reaction points at is old by nature, so it
				// is often expired or past our viewable allowance by the time the
				// bubble is tapped. The teaser still carries previews for it, so
				// the bubble opens on those instead of going nowhere.
				const resolved = await resolveAlbumForViewing({
					albumId,
					ownerProfileId: options.ownerProfileId,
				});
				this.#album = resolved.album;
				this.#fromPaywall = resolved.fromPaywall;
			}
			const album = this.#album;
			// The photo can be gone from the album by now (deleted, or trimmed by
			// an expiry), in which case the album still opens, just from the top.
			// A teaser never matches: its slides are synthesised, not the album's.
			const index =
				options.contentId === undefined || this.#fromPaywall
					? 0
					: album.content.findIndex(
							(slide) => slide.contentId === options.contentId,
						);
			this.#destroy = await openAlbumLightbox(album, {
				sharer: this.#sharer(options.ownerProfileId),
				// A teaser carries no content ids to reply or react to, so it opens
				// without the controls offering those.
				fromPaywall: this.#fromPaywall,
				startIndex: index < 0 ? 0 : index,
				onClosed: () => {
					this.phase = "idle";
					this.#destroy = null;
				},
			});
			this.phase = "open";
			if (this.#fromPaywall) announcePaywallTeaser();
		} catch (error) {
			this.phase = "idle";
			if (error instanceof AlbumLockedError) {
				toast.info(error.message);
			} else {
				console.error(error);
				showErrorToast({ label: "Failed to open album", error });
			}
		}
	}
}
