<script lang="ts">
	import EyeIcon from "phosphor-svelte/lib/EyeIcon";

	import RelativeTimeDynamic from "$lib/components/shared/RelativeTimeDynamic.svelte";
	import type { ViewPreview } from "$lib/model/interest/views";

	let {
		lastViewed,
		viewedCount,
	}: Pick<ViewPreview, "lastViewed" | "viewedCount"> = $props();

	const { totalCount, maxDisplayCount } = $derived(viewedCount);
	const countLabel = $derived(
		totalCount > maxDisplayCount ? `${maxDisplayCount}+` : `${totalCount}`,
	);
</script>

<!-- When they looked, and how often — the tile's label line for both a named
     viewer and a hidden one. -->
<span class="truncate">
	{#if lastViewed !== null}
		<RelativeTimeDynamic date={lastViewed} />
	{/if}
</span>
{#if totalCount > 1}
	<span
		class="ms-auto flex shrink-0 items-center gap-1"
		title="{totalCount} views"
	>
		<EyeIcon class="size-3" />
		{countLabel}<span class="sr-only">views</span>
	</span>
{/if}
