<script lang="ts">
	import FingerprintIcon from "phosphor-svelte/lib/FingerprintIcon";

	import { favoriteNote } from "$lib/api/users/favorite-notes-state.svelte";
	import ProfileMiniCard from "$lib/components/profile/ProfileMiniCard.svelte";
	import ViewedMeta from "./ViewedMeta.svelte";
	import type { MatchedViewer } from "./views-state.svelte";

	let { viewer }: { viewer: MatchedViewer } = $props();
</script>

{#snippet meta()}
	<FingerprintIcon
		weight="fill"
		role="img"
		aria-label="Matched by photo"
		class="size-2.5 shrink-0 text-plate-accent"
	/>
	<ViewedMeta
		lastViewed={viewer.lastViewed}
		viewedCount={viewer.viewedCount}
	/>
{/snippet}

<ProfileMiniCard
	mediaHash={viewer.profileImageMediaHash}
	displayName={viewer.displayName}
	distance={viewer.distance}
	isFavorite={viewer.isFavorite}
	note={favoriteNote(viewer.profileId)?.notes ?? null}
	href="/profile/{viewer.profileId}"
	{meta}
/>
