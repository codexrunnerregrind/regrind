<script lang="ts">
	import EyeIcon from "phosphor-svelte/lib/EyeIcon";
	import HeartIcon from "phosphor-svelte/lib/HeartIcon";

	import ProfileMiniCard from "$lib/components/profile/ProfileMiniCard.svelte";
	import LockIcon from "$lib/components/shared/LockIcon.svelte";
	import RelativeTimeDynamic from "$lib/components/shared/RelativeTimeDynamic.svelte";
	import type { ViewPreview } from "$lib/model/interest/views";

	let {
		preview,
	}: {
		preview: ViewPreview;
	} = $props();

	const { totalCount, maxDisplayCount } = $derived(preview.viewedCount);
	const viewedCountLabel = $derived(
		totalCount > maxDisplayCount ? `${maxDisplayCount}+` : `${totalCount}`,
	);
</script>

<ProfileMiniCard
	mediaHash={preview.profileImageMediaHash}
	distance={preview.distance}
	isFavorite={preview.isFavorite}
>
	{#snippet overlay()}
		<!-- Centred, because it stands for the whole tile: this viewer's photo is
		     the one thing the tile cannot show. -->
		<div class="absolute inset-0 flex items-center justify-center">
			<div
				class="flex size-9.5 items-center justify-center rounded-full bg-plate text-plate-foreground"
			>
				{#if preview.isSecretAdmirer}
					<HeartIcon weight="fill" class="size-4.5 text-rose-400" />
				{:else}
					<LockIcon class="size-4.5" />
				{/if}
			</div>
		</div>
		<!-- The same label band the people grids use, carrying when rather than
		     who — how long ago they looked, and how often. -->
		{#if preview.lastViewed !== null || totalCount > 1}
			<div
				class="tile-scrim z-1 flex items-center justify-between gap-1.5 text-2xs/[1.1] font-medium text-plate-muted"
			>
				<span class="truncate">
					{#if preview.lastViewed !== null}
						<RelativeTimeDynamic date={preview.lastViewed} />
					{/if}
				</span>
				{#if totalCount > 1}
					<span
						class="flex shrink-0 items-center gap-1"
						title="{totalCount} views"
					>
						<EyeIcon class="size-3" />
						{viewedCountLabel}
					</span>
				{/if}
			</div>
		{/if}
	{/snippet}
</ProfileMiniCard>
