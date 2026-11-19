<script lang="ts">
	import EyeIcon from "phosphor-svelte/lib/EyeIcon";

	import RelativeTimeDynamic from "#lib/components/shared/RelativeTimeDynamic.svelte";
	import { t } from "#lib/i18n/index.ts";
	import Rich from "#lib/i18n/Rich.svelte";
	import type { ViewPreview } from "#lib/model/interest/views.ts";

	let {
		lastViewed,
		viewedCount,
	}: Pick<ViewPreview, "lastViewed" | "viewedCount"> = $props();

	const { totalCount, maxDisplayCount } = $derived(viewedCount);
	const viewCount = $derived(
		totalCount > maxDisplayCount
			? ({
					key: "interest.views.preview.cappedViewCount",
					count: maxDisplayCount,
				} as const)
			: ({
					key: "interest.views.preview.viewCount",
					count: totalCount,
				} as const),
	);
</script>

{#snippet srOnly(text: string)}<span class="sr-only">{text}</span>{/snippet}

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
		title={t("interest.views.preview.totalViews", { count: totalCount })}
	>
		<EyeIcon class="size-3" />
		<Rich key={viewCount.key} count={viewCount.count} {srOnly} />
	</span>
{/if}
