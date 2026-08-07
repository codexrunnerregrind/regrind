<script lang="ts">
	import { ArrowBendUpLeftIcon, XIcon } from "phosphor-svelte";

	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import {
		type ApiResponseMessage,
		previewFromMessage,
		previewLabel,
		replyThumbnailUrl,
	} from "$lib/model/messaging/messages";

	let {
		message,
		onCancel,
	}: { message: ApiResponseMessage; onCancel?: () => void } = $props();

	const label = $derived(previewLabel(previewFromMessage(message)));
	const thumbnail = $derived(replyThumbnailUrl(message));
</script>

<!-- Mirrors the quote that will end up inside the sent bubble, so what you are
     replying to looks the same while composing as it does afterwards. -->
<div class="flex items-stretch gap-2 overflow-hidden rounded-md bg-muted">
	<span class="w-0.75 shrink-0 bg-primary"></span>
	<div class="flex min-w-0 flex-1 items-center gap-2 py-1.5">
		<ArrowBendUpLeftIcon class="shrink-0 text-muted-foreground" size={16} />
		<span class="min-w-0 flex-1 truncate text-caption text-muted-foreground">
			{label}
		</span>
	</div>
	{#if thumbnail !== null}
		<MediaImage
			src={thumbnail}
			alt=""
			loading="lazy"
			class="size-10 shrink-0 object-cover"
			aspectRatio="1 / 1"
		/>
	{/if}
	<button
		type="button"
		aria-label="Cancel reply"
		class="shrink-0 self-center rounded-full p-1 text-muted-foreground active:bg-foreground/10"
		onclick={onCancel}
	>
		<XIcon size={14} />
	</button>
</div>
