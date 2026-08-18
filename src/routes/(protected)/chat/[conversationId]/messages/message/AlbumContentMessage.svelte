<script lang="ts">
	import { myAlbumCoverUrl } from "$lib/chat/my-albums";
	import { paywallCoverUrl } from "$lib/chat/paywall-covers";
	import { getNow } from "$lib/util/now";
	import type {
		AlbumContentReactionMessage,
		AlbumContentReplyMessage,
	} from "$lib/model/messaging/messages";
	import { getConversationState } from "../../conversation-state.svelte";
	import { AlbumBubbleOpener } from "./album-bubble-open.svelte";
	import LockedMedia from "./LockedMedia.svelte";
	import { MessageMediaState } from "./message-media.svelte";
	import MessageQuoteBlock from "./MessageQuoteBlock.svelte";
	import Reaction from "./Reaction.svelte";

	let {
		message,
	}: {
		message:
			| AlbumContentReplyMessage["body"]
			| AlbumContentReactionMessage["body"];
	} = $props();

	const media = new MessageMediaState();
	const opener = new AlbumBubbleOpener();
	const conversation = $derived(getConversationState()());

	// A reaction carries the same body as a reply, minus the text.
	const replyText = $derived(
		"albumContentReply" in message ? message.albumContentReply : null,
	);

	// The reaction body carries no emoji: the API offers no choice, so it always
	// means 🔥. Without showing it, a reaction is just a photo on its own and
	// reads as if someone sent you a picture.
	const isReaction = $derived(replyText === null);

	// Unlike an album share, this body has no expirationType — `viewable` is the
	// real gate and the stamp just tells us when it lapses, so this only ever
	// locks the preview rather than rendering a countdown.
	const expired = $derived(
		message.expiresAt !== null && message.expiresAt <= getNow(),
	);

	const locked = $derived(
		!message.viewable || message.previewUrl === null || expired,
	);

	// A reply or reaction to one of our own photos points at our album, and ours
	// stays ours however the share ends up (AlbumBubbleOpener draws the same
	// line when it decides where to open the album from).
	const isOurs = $derived(
		message.ownerProfileId === conversation.ourProfileId,
	);

	// A locked bubble still has something to show, the same as a locked album
	// share does: the paywall teaser's blurred cover for somebody else's album,
	// and our own album's cover for one of ours. The body's `previewUrl` stands
	// in until that lands, and only as long as the signature it was sent with
	// holds — which for an old reply is usually not at all.
	let freshCover = $state<string | null>(null);

	const preview = $derived(
		locked ? (freshCover ?? message.previewUrl) : message.previewUrl,
	);

	$effect(() => {
		// A viewable preview's own url is current; only a locked one needs asking.
		if (!locked) return;
		const { albumId, ownerProfileId } = message;
		const ours = isOurs;
		let cancelled = false;
		void (
			ours
				? myAlbumCoverUrl(albumId)
				: paywallCoverUrl({ albumId, ownerProfileId })
		)
			.then((url) => {
				if (!cancelled && url !== null) freshCover = url;
			})
			// A cover we cannot reach just leaves the lock plate up.
			.catch((error: unknown) => {
				console.error(error);
			});
		return () => {
			cancelled = true;
		};
	});

	function openAlbum() {
		void opener.open(message.albumId, {
			ownerProfileId: message.ownerProfileId,
			contentId: message.albumContentId,
		});
	}

	const previewClass: import("svelte/elements").ClassValue = $derived([
		"relative aspect-3/4",
		// The preview references which album photo this is about; it is not the
		// message itself, so it stays a thumbnail rather than matching the size
		// of a shared album.
		{ "w-full": media.clone, "w-24": !media.clone },
		media.cornerClass,
	]);
</script>

{#snippet previewContent()}
	{#if preview === null}
		<LockedMedia class={media.cornerClass} />
	{:else}
		<img
			src={preview}
			alt=""
			class={[
				// rounded-xl to match LockedMedia, which this swaps with, and the
				// album cover in AlbumMessage.
				"size-full rounded-xl bg-card-foreground/10 object-cover",
				media.cornerClass,
			]}
			draggable="false"
		/>
	{/if}
	{#if isReaction}
		<!-- Placed exactly where a reaction on a message sits (the adornments
		     snippet in Message.svelte): a tap is a tap, wherever it landed, so it
		     hangs off the same corner — the far one, away from the stack's tail. -->
		<div
			class={[
				"absolute top-0 z-5 mt-1 mr-1 -translate-y-1/2",
				{
					"right-0 translate-x-1/2": !media.isOut,
					"left-0 -translate-x-1/2": media.isOut,
				},
			]}
		>
			<Reaction type={1} />
		</div>
	{/if}
{/snippet}

{#if isReaction}
	<div
		class={[
			"flex flex-col gap-1",
			{
				// Sized to the preview, which is all a reaction is: a thumbnail
				// of the photo it answers, with the tap badge hanging off it.
				"w-fit max-w-60": !media.clone,
				"size-full": media.clone,
			},
		]}
		{@attach media.attach}
	>
		{#if locked}
			<div class={previewClass}>
				{@render previewContent()}
			</div>
		{:else}
			<!-- The preview is a pointer into the album: tapping it opens the album
			     viewer on that photo, the same as tapping the album share would. -->
			<button
				type="button"
				class={[
					previewClass,
					{ "opacity-50": opener.phase === "loading" },
				]}
				aria-label="Open this photo in the album"
				disabled={opener.phase !== "idle"}
				onclick={openAlbum}
			>
				{@render previewContent()}
			</button>
		{/if}
		{@render media.adornments?.()}
	</div>
{:else}
	<!-- A reply to an album photo is drawn as the same bubble as a reply to a
	     photo in the conversation: the picture quoted above the reply's own text,
	     inside one bubble. The quote points into the album rather than at a
	     message in this conversation, so tapping it opens the album on that
	     photo. -->
	<div class={["flex max-w-[74%] flex-col", { "items-end": media.isOut }]}>
		<div
			class={[
				"relative w-fit max-w-full shrink-0 overflow-visible rounded-bubble px-3.5 py-2.75 text-row/[1.45] select-text",
				{
					"pointer-coarse:select-none": !media.clone,
					"bg-message-bubble-in text-message-bubble-foreground":
						!media.isOut,
					"rounded-es-bubble-tail": media.lastInStack && !media.isOut,
					"bg-message-bubble-out text-message-bubble-out-foreground":
						media.isOut,
					"rounded-ee-bubble-tail": media.lastInStack && media.isOut,
				},
			]}
			{@attach media.attach}
		>
			<MessageQuoteBlock
				thumbnail={preview}
				title={media.isOut ? "Reply to them" : "Reply to me"}
				label="Album"
				busy={opener.phase === "loading"}
				onclick={media.clone
					? undefined
					: (event) => {
							// The bubble row itself is a button (long-press menu,
							// double-tap react); opening the album is this quote's
							// own action.
							event.stopPropagation();
							openAlbum();
						}}
			/>
			<span class="wrap-anywhere whitespace-pre-wrap">{replyText}</span>
			{@render media.adornments?.()}
		</div>
	</div>
{/if}
