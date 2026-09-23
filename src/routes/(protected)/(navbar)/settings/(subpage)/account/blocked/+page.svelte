<script lang="ts" module>
	const scroll = { scrollY: 0 };
</script>

<script lang="ts">
	import { getBlockedUsers, unblockUser } from "$lib/api/browse/blocks";
	import ProfileList from "$lib/components/profile-list/ProfileList.svelte";
</script>

<svelte:head>
	<title>Blocked users</title>
</svelte:head>

<!-- The explanation leads, above the count and the list: what a block does is
     what someone came here to check. -->
<p class="pt-1 pb-3.5 text-preview/[1.45] text-pretty text-ink3">
	Blocked people can't see your profile, message you, or appear in your feed.
	Because a block hides their profile from you as well, most entries here show
	only a profile ID.
</p>
<ProfileList
	loadIds={async () =>
		(await getBlockedUsers()).map(({ profileId }) => profileId)}
	lift={({ profileId }) => unblockUser({ profileId })}
	{scroll}
	actionLabel="Unblock"
	countLabel="blocked"
	emptyMessage="You haven't blocked anyone."
	successMessage="User unblocked"
	errorLabel="Failed to unblock user"
/>
