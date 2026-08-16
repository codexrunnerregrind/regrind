<script lang="ts">
	import fireEmoji from "$lib/assets/emojis/fire/32px.png";
	import { getNow } from "$lib/util/now";
	import type {
		AlbumContentReactionMessage,
		AlbumContentReplyMessage,
	} from "$lib/model/messaging/messages";
	import { AlbumBubbleOpener } from "./album-bubble-open.svelte";
	import { getMessageContext } from "./context";
	import LockedMedia from "./LockedMedia.svelte";
	import { MessageMediaState } from "./message-media.svelte";

	let {
		message,
	}: {
		message:
			| AlbumContentReplyMessage["body"]
			| AlbumContentReactionMessage["body"];
	} = $props();

	const media = new MessageMediaState();
	const opener = new AlbumBubbleOpener();
	const { isOut } = $derived(getMessageContext()());

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
	{#if locked}
		<LockedMedia class={media.cornerClass} />
	{:else}
		<img
			src={message.previewUrl}
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
		<div
			class="absolute -bottom-2 left-2 flex items-center rounded-full border border-muted-foreground/20 bg-card px-1.5 py-0.5 shadow-sm"
		>
			<img
				src={fireEmoji}
				alt="Reacted with fire"
				width="16"
				height="16"
				draggable="false"
			/>
		</div>
	{/if}
{/snippet}

<div
	class={[
		"flex flex-col gap-1",
		{
			// Sized to the reply bubble, not the preview: the preview is a fixed
			// thumbnail below, so a reaction collapses to just that.
			"w-fit max-w-60": !media.clone,
			"size-full": media.clone,
			// The 🔥 badge hangs below the thumbnail, so without this it lands on
			// top of whatever message comes next in the stack.
			"mb-2": isReaction,
		},
	]}
	bind:this={media.el}
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
			class={[previewClass, { "opacity-50": opener.phase === "loading" }]}
			aria-label="Open this photo in the album"
			disabled={opener.phase !== "idle"}
			onclick={() =>
				void opener.open(message.albumId, {
					ownerProfileId: message.ownerProfileId,
					contentId: message.albumContentId,
				})}
		>
			{@render previewContent()}
		</button>
	{/if}

	{#if replyText !== null && replyText !== ""}
		<div
			class={[
				// Explicit cap rather than max-w-full: the parent is w-fit, so a
				// percentage would resolve against a width the bubble itself sets.
				"w-fit max-w-60 rounded-xl px-3 py-2 select-text",
				{
					"pointer-coarse:select-none": !media.clone,
					"bg-message-bubble-in text-message-bubble-foreground":
						!isOut,
					"bg-message-bubble-out text-message-bubble-out-foreground":
						isOut,
				},
			]}
		>
			<span class="wrap-anywhere whitespace-pre-wrap">{replyText}</span>
		</div>
	{/if}
	{@render media.adornments?.()}
</div>
