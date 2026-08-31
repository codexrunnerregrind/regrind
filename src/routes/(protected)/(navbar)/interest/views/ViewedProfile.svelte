<script lang="ts">
	import { favoriteNote } from "$lib/api/users/favorite-notes-state.svelte";
	import ProfileMiniCard from "$lib/components/profile/ProfileMiniCard.svelte";
	import type { ViewerProfile } from "$lib/model/interest/views";
	import ViewedMeta from "./ViewedMeta.svelte";

	let { view }: { view: ViewerProfile } = $props();

	const hasMeta = $derived(
		view.lastViewed !== null || view.viewedCount.totalCount > 1,
	);
</script>

{#snippet meta()}
	<ViewedMeta lastViewed={view.lastViewed} viewedCount={view.viewedCount} />
{/snippet}

<ProfileMiniCard
	mediaHash={view.profileImageMediaHash}
	displayName={view.displayName}
	distance={view.distance}
	onlineUntil={view.onlineUntil}
	isFavorite={view.isFavorite}
	note={favoriteNote(view.profileId)?.notes ?? null}
	href="/profile/{view.profileId}"
	meta={hasMeta ? meta : undefined}
/>
