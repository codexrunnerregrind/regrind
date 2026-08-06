<script lang="ts">
	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import * as Avatar from "$lib/components/ui/avatar";
	import { getNow } from "$lib/util/now";

	let {
		profileId,
		displayName = null,
		mediaHash = null,
		onlineUntil = null,
	}: {
		profileId: number;
		displayName: string | null;
		mediaHash: string | null;
		onlineUntil: number | null;
	} = $props();

	const online = $derived(onlineUntil !== null && onlineUntil > getNow());
</script>

<a class="relative isolate inline-block" href="/profile/{profileId}">
	<span class="sr-only">{displayName ? displayName : "Someone"}</span>
	<Avatar.Root class="size-16 *:rounded-full">
		<UserAvatar
			{mediaHash}
			class="size-16 overflow-hidden rounded-full bg-media-placeholder *:rounded-full"
		/>
		{#if online}
			<Avatar.Badge class="right-1 bottom-1 bg-green-500" />
			<span class="sr-only">Online</span>
		{/if}
		<span class="sr-only">View profile</span>
	</Avatar.Root>
</a>
