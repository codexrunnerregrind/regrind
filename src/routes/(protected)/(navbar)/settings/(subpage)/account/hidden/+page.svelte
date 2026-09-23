<script lang="ts" module>
	const scroll = { scrollY: 0 };
</script>

<script lang="ts">
	import { getHiddenUsers, unhideUser } from "$lib/api/browse/hides";
	import ProfileList from "$lib/components/profile-list/ProfileList.svelte";
</script>

<svelte:head>
	<title>Hidden users</title>
</svelte:head>

<!-- Same shape as Blocked users, and for the same reason: a hide also takes the
     profile away from us, so the list leads with what it means. -->
<p class="pt-1 pb-3.5 text-preview/[1.45] text-pretty text-ink3">
	Hidden people don't appear in your feed, and their profile stays out of
	reach for you, so most entries here show only a profile ID.
</p>
<ProfileList
	loadIds={async () =>
		(await getHiddenUsers()).map(({ profileId }) => profileId)}
	lift={({ profileId }) => unhideUser({ profileId })}
	{scroll}
	actionLabel="Unhide"
	countLabel="hidden"
	emptyMessage="You haven't hidden anyone."
	successMessage="User unhidden"
	errorLabel="Failed to unhide user"
/>
