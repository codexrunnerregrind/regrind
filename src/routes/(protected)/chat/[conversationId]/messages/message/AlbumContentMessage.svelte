<script lang="ts">
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
		{ "ms-3 w-2/5 max-w-60 min-w-35": !media.clone, "size-full": media.clone },
	]}
	bind:this={media.el}
>
	<div class={["relative aspect-3/4", media.cornerClass]}>
		{#if locked}
			<LockedMedia class={media.cornerClass} />
		{:else}
			<img
				src={message.previewUrl}
				alt=""
				class={[
					"size-full bg-card-foreground/10 object-cover",
					media.cornerClass,
				]}
				draggable="false"
			/>
		{/if}
	</div>

	{#if replyText !== null && replyText !== ""}
		<div
			class={[
				"w-fit max-w-full rounded-xl px-3 py-2 text-black select-text",
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
