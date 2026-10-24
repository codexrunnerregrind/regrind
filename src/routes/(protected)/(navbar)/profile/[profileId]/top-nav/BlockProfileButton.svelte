<script lang="ts">
	import { preferencesSnapshot } from "$lib/app-data/preferences.svelte";
	import BlockProfileDialog from "$lib/components/profile/BlockProfileDialog.svelte";
	import { Button } from "$lib/components/ui/button";
	import { blockProfile } from "../profile-actions";
	import type { PendingViewabilityChange } from "../profile-state.svelte";
	import BlockUserIcon from "./BlockUserIcon.svelte";

	let {
		profileId,
		name = null,
		changingViewability,
		markBlocked,
	}: {
		profileId: number;
		name?: string | null;
		changingViewability: boolean;
		markBlocked: () => PendingViewabilityChange;
	} = $props();

	let confirmOpen = $state(false);

	function block() {
		void blockProfile({ profileId, markBlocked });
	}
</script>

<Button
	size="icon-lg"
	variant="secondary"
	aria-label="Block profile"
	class="size-12 border-border"
	disabled={changingViewability}
	onclick={() => {
		if (preferencesSnapshot().confirmBlock) confirmOpen = true;
		else block();
	}}
>
	<BlockUserIcon />
</Button>

<BlockProfileDialog
	bind:open={confirmOpen}
	{profileId}
	{name}
	onConfirm={block}
/>
