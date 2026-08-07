<script lang="ts">
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import {
		type ApiResponseMessage,
		previewFromMessage,
		previewLabel,
		replyThumbnailUrl,
	} from "$lib/model/messaging/messages";

	let {
		replyTo,
		isOut,
	}: {
		replyTo: ApiResponseMessage;
		/** Whose bubble the quote is sitting in — the label says so. */
		isOut: boolean;
	} = $props();

	const label = $derived(previewLabel(previewFromMessage(replyTo)));

	const thumbnail = $derived(replyThumbnailUrl(replyTo));
</script>

<!-- Sits inside the bubble, above the reply's own body, so a reply and what it
     answers stay one block. The bar and fill are drawn from the bubble's own
     text colour, so this works on either side without knowing the theme. -->
<!-- The min-width is load-bearing: the bubble is `w-fit`, and both lines here
     truncate, so their min-content width is zero — without it a one-emoji reply
     would squeeze the quote down to "R… / Ph…". -->
<div
	class="mb-1.5 flex min-w-45 items-stretch gap-2 overflow-hidden rounded-md bg-current/10"
>
	<span class="w-0.75 shrink-0 bg-current/40"></span>
	<div class="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-1.5">
		<span class="truncate text-2xs font-semibold">
			{isOut ? "Reply to them" : "Reply to me"}
		</span>
		<span class="truncate text-2xs opacity-70">{label}</span>
	</div>
	{#if thumbnail !== null}
		<MediaImage
			src={thumbnail}
			alt=""
			loading="lazy"
			class="size-9.5 shrink-0 object-cover"
			aspectRatio="1 / 1"
		/>
	{/if}
</div>
