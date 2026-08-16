<script lang="ts">
	import MediaImage from "$lib/components/shared/MediaImage.svelte";

	let {
		thumbnail = null,
		title,
		label,
		onclick,
		busy = false,
	}: {
		/** The picture being answered, when the quote has one to show. */
		thumbnail?: string | null;
		/** Whose message this answers — "Reply to them" / "Reply to me". */
		title: string;
		/** What was answered: the text of it, or "Photo", "Album"… */
		label: string;
		/** Omit for a quote with nothing to jump to, which renders inert. */
		onclick?: (event: MouseEvent) => void;
		busy?: boolean;
	} = $props();
</script>

<!-- Sits inside the bubble, above the reply's own body, so a reply and what it
     answers stay one block. The bar and fill are drawn from the bubble's own
     text color, so this works on either side without knowing the theme. -->
<!-- The min-width is load-bearing: the bubble is `w-fit`, and both lines here
     truncate, so their min-content width is zero — without it a one-emoji reply
     would squeeze the quote down to "R… / Ph…". -->
<button
	type="button"
	class="mb-1.5 flex w-full min-w-45 items-stretch gap-2 overflow-hidden rounded-md bg-current/10 text-start active:bg-current/20"
	disabled={onclick === undefined}
	aria-busy={busy}
	{onclick}
>
	<span class="w-0.75 shrink-0 bg-current/40"></span>
	{#if thumbnail !== null}
		<MediaImage
			src={thumbnail}
			alt=""
			loading="lazy"
			class="size-9.5 shrink-0 self-center rounded-sm object-cover"
			aspectRatio="1 / 1"
		/>
	{/if}
	<div
		class="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-1.5 pe-2.5"
	>
		<span class="truncate text-2xs font-semibold">{title}</span>
		<span class="truncate text-2xs opacity-70">{label}</span>
	</div>
</button>
