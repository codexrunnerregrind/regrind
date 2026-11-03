<script lang="ts">
	import type { Profile } from "$lib/model/users/profiles";
	import type { PendingViewabilityChange } from "../profile-state.svelte";
	import BlockProfileButton from "./BlockProfileButton.svelte";
	import EditProfileButton from "./EditProfileButton.svelte";
	import FavoriteProfileToggle from "./FavoriteProfileToggle.svelte";

	let {
		ourProfile,
		profile,
		changingViewability,
		markBlocked,
		onFavorite,
	}: {
		ourProfile: boolean;
		profile: Profile | null;
		changingViewability: boolean;
		markBlocked: () => PendingViewabilityChange;
		onFavorite: (isFavorite: boolean) => void;
	} = $props();
</script>

{#if ourProfile || profile}
	<nav
		aria-label="Profile actions"
		class="relative right-2 flex -translate-y-1/2 flex-row-reverse items-center gap-1.5"
	>
		{#if ourProfile}
			<EditProfileButton />
		{:else if profile}
			<FavoriteProfileToggle
				profileId={profile.profileId}
				isFavorite={profile.isFavorite}
				{onFavorite}
			/>
			<BlockProfileButton
				profileId={profile.profileId}
				name={profile.displayName}
				{changingViewability}
				{markBlocked}
			/>
		{/if}
	</nav>
{/if}
