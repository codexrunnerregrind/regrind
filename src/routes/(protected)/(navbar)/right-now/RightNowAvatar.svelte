<script lang="ts">
	import * as Avatar from "$lib/components/ui/avatar";
	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import { getNow, subscribeNow } from "$lib/util/now.svelte";

	let {
		profileId,
		mediaHash = null,
		onlineUntil = null,
	}: {
		profileId: number;
		mediaHash: string | null;
		onlineUntil: number | null;
	} = $props();

	$effect(() => subscribeNow());

	const online = $derived(onlineUntil != null && onlineUntil > getNow());
</script>

<a class="relative isolate inline-block" href="/profile/{profileId}">
	<Avatar.Root class="size-20 *:rounded-full">
		<UserAvatar
			{mediaHash}
			class="size-20 overflow-hidden rounded-full bg-neutral-700 *:rounded-full"
		/>
		{#if online}
			<Avatar.Badge class="bg-green-500"></Avatar.Badge>
		{/if}
	</Avatar.Root>
</a>
