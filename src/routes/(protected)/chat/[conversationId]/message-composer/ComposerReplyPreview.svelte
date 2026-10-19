<script lang="ts">
	import ArrowBendUpLeftIcon from "phosphor-svelte/lib/ArrowBendUpLeftIcon";
	import XIcon from "phosphor-svelte/lib/XIcon";

	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import {
		previewFromMessage,
		quoteLabel,
		replyThumbnailUrl,
	} from "$lib/model/messaging/message-preview";
	import { type ApiResponseMessage } from "$lib/model/messaging/messages";
	import { getConversationState } from "../conversation-state.svelte";

	let {
		message,
		onCancel,
	}: { message: ApiResponseMessage; onCancel?: () => void } = $props();

	const label = $derived(quoteLabel(previewFromMessage(message)));
	const thumbnail = $derived(replyThumbnailUrl(message));

	const conversationState = $derived(getConversationState()());

	// Says whose message this is, the way the quote inside the sent bubble will.
	const who = $derived(
		message.senderId === conversationState.ourProfileId
			? "your message"
			: conversationState.profile?.name?.trim() || "them",
	);
</script>

<!-- Mirrors the quote that will end up inside the sent bubble, so what you are
     replying to looks the same while composing as it does afterwards. -->
<div class="flex items-stretch gap-2.5 overflow-hidden rounded-lg bg-muted">
	<span class="w-1 shrink-0 bg-primary"></span>
	<div class="flex min-w-0 flex-1 items-center gap-2.5 py-2">
		<ArrowBendUpLeftIcon
			class="shrink-0 self-center text-muted-foreground"
			size={18}
		/>
		<!-- Thumbnail leads the label rather than trailing it, so the arrow, what
		     you are replying to, and its name read left to right as one phrase. -->
		{#if thumbnail !== null}
			<MediaImage
				src={thumbnail}
				alt=""
				loading="lazy"
				class="size-11 shrink-0 rounded-md object-cover"
				aspectRatio="1 / 1"
			/>
		{/if}
		<div class="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
			<span class="truncate text-caption font-semibold">
				Replying to {who}
			</span>
			<span class="truncate text-caption text-muted-foreground">
				{label}
			</span>
		</div>
	</div>
	<!-- A full 36px target on its own: the old 14px glyph sat close enough to
	     the field that dismissing a reply took aim. -->
	<button
		type="button"
		aria-label="Cancel reply"
		class="me-1.5 flex size-9 shrink-0 items-center justify-center self-center rounded-full text-muted-foreground active:bg-foreground/10"
		onclick={onCancel}
	>
		<XIcon size={18} />
	</button>
</div>
