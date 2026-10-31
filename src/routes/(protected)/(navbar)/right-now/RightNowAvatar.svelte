<script lang="ts">
	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import * as Avatar from "$lib/components/ui/avatar";
	import {
		appendProfileTransitionQueryParam,
		getProfileTransitionName,
	} from "$lib/platform/view-transitions";
	import { getNow } from "$lib/util/now";

	const TRANSITION_NAME = "rightNow";

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

	const hrefWithTransitionQueryParam = $derived.by(() => {
		const href = `/profile/${profileId}`;
		if (!mediaHash) return href;
		return appendProfileTransitionQueryParam(
			href,
			TRANSITION_NAME,
			mediaHash,
		);
	});
	const transitionName = $derived(
		getProfileTransitionName(TRANSITION_NAME, mediaHash),
	);
</script>

<a class="relative isolate inline-block" href={hrefWithTransitionQueryParam}>
	<span class="sr-only">{displayName ? displayName : "Someone"}</span>
	<Avatar.Root class="size-16 *:rounded-full">
		<UserAvatar
			{mediaHash}
			{transitionName}
			class="size-16 overflow-hidden rounded-full bg-media-placeholder *:rounded-full"
		/>
		{#if online}
			<Avatar.Badge class="right-1 bottom-1 bg-green-500" />
			<span class="sr-only">Online</span>
		{/if}
		<span class="sr-only">View profile</span>
	</Avatar.Root>
</a>
