<script lang="ts">
	import BlockProfileDialog from "$lib/components/profile/BlockProfileDialog.svelte";
	import TapBurst, {
		TAP_BURST_MS,
	} from "$lib/components/profile/TapBurst.svelte";
	import { recentGridTap } from "$lib/interest/profile-activity.svelte";
	import { TapType } from "$lib/model/interest/taps";
	import { profilePeek } from "./peek-state.svelte";
	import ProfilePeek from "./ProfilePeek.svelte";

	let { ourProfileId }: { ourProfileId: number } = $props();

	$effect(() => {
		const burst = profilePeek.burst;
		if (burst === null) return;
		const timer = setTimeout(() => {
			if (profilePeek.burst?.id === burst.id) profilePeek.burst = null;
		}, TAP_BURST_MS);
		return () => clearTimeout(timer);
	});

	let confirmOpen = $state(false);
	$effect(() => {
		if (profilePeek.confirmBlock !== null) confirmOpen = true;
	});
	$effect(() => {
		if (!confirmOpen) profilePeek.confirmBlock = null;
	});
</script>

{#snippet burst(inline: boolean)}
	{#if profilePeek.burst}
		{#key profilePeek.burst.id}
			<TapBurst
				tapType={TapType.Hot}
				x={profilePeek.burst.x}
				y={profilePeek.burst.y}
				pop
				{inline}
			/>
		{/key}
	{/if}
{/snippet}

{#if profilePeek.current}
	{@const { anchor, profile } = profilePeek.current}
	{#key profile.profileId}
		<ProfilePeek
			{anchor}
			{profile}
			{ourProfileId}
			tapSent={recentGridTap(profile.profileId, Date.now())?.received ===
				false}
			onClose={() => profilePeek.close()}
		>
			{@render burst(true)}
		</ProfilePeek>
	{/key}
{:else}
	{@render burst(false)}
{/if}

{#if profilePeek.confirmBlock}
	<BlockProfileDialog
		bind:open={confirmOpen}
		profileId={profilePeek.confirmBlock.profileId}
		name={profilePeek.confirmBlock.displayName}
	/>
{/if}
