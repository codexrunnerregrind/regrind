<script lang="ts">
	import HeartIcon from "phosphor-svelte/lib/HeartIcon";

	import ProfileMiniCard from "$lib/components/profile/ProfileMiniCard.svelte";
	import LockIcon from "$lib/components/shared/LockIcon.svelte";
	import type { ViewPreview } from "$lib/model/interest/views";
	import ViewedMeta from "./ViewedMeta.svelte";

	let { preview }: { preview: ViewPreview } = $props();

	const hasMeta = $derived(
		preview.lastViewed !== null || preview.viewedCount.totalCount > 1,
	);
</script>

{#snippet meta()}
	<ViewedMeta
		lastViewed={preview.lastViewed}
		viewedCount={preview.viewedCount}
	/>
{/snippet}

<ProfileMiniCard
	mediaHash={preview.profileImageMediaHash}
	distance={preview.distance}
	isFavorite={preview.isFavorite}
	meta={hasMeta ? meta : undefined}
>
	{#snippet overlay()}
		<!-- Centered, because it stands for the whole tile: this viewer's photo is
		     the one thing the tile cannot show. -->
		<div class="absolute inset-0 flex items-center justify-center">
			<div
				class="flex size-9.5 items-center justify-center rounded-full bg-plate text-plate-foreground"
			>
				{#if preview.isSecretAdmirer}
					<HeartIcon weight="fill" class="size-4.5 text-rose-400" />
					<span class="sr-only">Secret admirer</span>
				{:else}
					<LockIcon class="size-4.5" />
					<span class="sr-only">Hidden viewer</span>
				{/if}
			</div>
		</div>
	{/snippet}
</ProfileMiniCard>
