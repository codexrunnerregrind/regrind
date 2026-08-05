<script lang="ts">
	import SectionFooter from "$lib/components/settings/SectionFooter.svelte";
	import SectionHeader from "$lib/components/settings/SectionHeader.svelte";
	import BlockedUsersList from "./BlockedUsersList.svelte";
</script>

<SectionHeader>Blocked</SectionHeader>
<BlockedUsersList />
<SectionFooter>
	Blocked users can't see your profile or message you, and you won't see theirs.
	Because a block hides their profile from you as well, most entries here show
	only a profile ID.
</SectionFooter>
