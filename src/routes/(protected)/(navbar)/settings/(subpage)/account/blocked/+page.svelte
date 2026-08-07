<script lang="ts">
	import BlockedUsersList from "./BlockedUsersList.svelte";
</script>

<!-- The explanation leads, above the count and the list: what a block does is
     what someone came here to check. -->
<p class="pt-1 pb-3.5 text-preview/[1.45] text-pretty text-ink3">
	Blocked people can't see your profile, message you, or appear in your feed.
	Because a block hides their profile from you as well, most entries here show
	only a profile ID.
</p>
<BlockedUsersList />
