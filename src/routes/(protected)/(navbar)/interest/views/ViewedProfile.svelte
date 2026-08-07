<script lang="ts">
	import { favoriteNote } from "$lib/api/users/favorite-notes-state.svelte";
	import ProfileMiniCard from "$lib/components/profile/ProfileMiniCard.svelte";
	import type { ViewerProfile } from "$lib/model/interest/views";

	let {
		view,
	}: {
		view: ViewerProfile;
	} = $props();
</script>

<ProfileMiniCard
	mediaHash={view.profileImageMediaHash}
	displayName={view.displayName}
	distance={view.distance}
	onlineUntil={view.onlineUntil}
	isFavorite={view.isFavorite}
	note={favoriteNote(view.profileId)?.notes ?? null}
	href="/profile/{view.profileId}"
/>
