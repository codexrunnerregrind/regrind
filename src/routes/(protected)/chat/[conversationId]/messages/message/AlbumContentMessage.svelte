<script lang="ts">
	import fireEmoji from "$lib/assets/emojis/fire/32px.png";
	import { getNow, subscribeNow } from "$lib/util/now.svelte";
	import type {
		AlbumContentReactionMessage,
		AlbumContentReplyMessage,
	} from "$lib/model/messaging/messages";
	import { getMessageContext } from "./context";
	import LockedMedia from "./LockedMedia.svelte";
	import { MessageMediaState } from "./message-media.svelte";

	let {
		message,
	}: {
		message:
			AlbumContentReplyMessage["body"] | AlbumContentReactionMessage["body"];
	} = $props();

	const media = new MessageMediaState();
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

	// Only tick the shared clock while an item that can lapse is on screen.
	$effect(() => {
		if (message.expiresAt === null || expired) return;
		return subscribeNow();
	});

	const locked = $derived(
		!message.viewable || message.previewUrl === null || expired,
	);
</script>

<div
	class={[
		"flex flex-col gap-1",
		{
			"ms-3": !media.clone,
			// Sized to the reply bubble, not the preview: the preview is a fixed
			// thumbnail below, so a reaction collapses to just that.
			"w-fit max-w-60": !media.clone,
			"size-full": media.clone,
		},
	]}
	bind:this={media.el}
>
	<div
		class={[
			"relative aspect-3/4",
			// The preview references which album photo this is about; it is not the
			// message itself, so it stays a thumbnail rather than matching the size
			// of a shared album.
			media.clone ? "w-full" : "w-24",
			media.cornerClass,
		]}
	>
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
	</div>

	{#if replyText !== null && replyText !== ""}
		<div
			class={[
				// Explicit cap rather than max-w-full: the parent is w-fit, so a
				// percentage would resolve against a width the bubble itself sets.
				"w-fit max-w-60 rounded-xl px-3 py-2 text-black select-text",
				{
					"pointer-coarse:select-none": !media.clone,
					"bg-message-bubble-in": !isOut,
					"bg-message-bubble-out": isOut,
				},
			]}
		>
			<span class="whitespace-pre-wrap">{replyText}</span>
		</div>
	{/if}
	{@render media.adornments?.()}
</div>
