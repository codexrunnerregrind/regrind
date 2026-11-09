<script lang="ts">
	import ProhibitIcon from "phosphor-svelte/lib/ProhibitIcon";

	import { unblockUser } from "#lib/api/browse/blocks.ts";
	import { Button } from "#lib/components/ui/button/index.ts";
	import * as Empty from "#lib/components/ui/empty/index.ts";
	import Link from "#lib/components/ui/link/Link.svelte";
	import {
		applyViewabilityChange,
		type PendingViewabilityChange,
	} from "./profile-state.svelte";

	let {
		profileId,
		blockedByUs,
		markViewable,
	}: {
		profileId: number;
		blockedByUs: boolean;
		markViewable: () => PendingViewabilityChange;
	} = $props();
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<ProhibitIcon />
		</Empty.Media>
		<Empty.Title>
			{#if blockedByUs}
				You have blocked this profile.
			{:else}
				This person has blocked you.
			{/if}
		</Empty.Title>
		<Empty.Description>
			{#if blockedByUs}
				<Button
					variant="secondary"
					onclick={() =>
						applyViewabilityChange({
							change: markViewable,
							request: () => unblockUser({ profileId }),
							failureLabel: "Failed to unblock user",
						})}>Unblock</Button
				>
			{:else}
				If you know this is a bug in the app, <Link
					href="https://github.com/codexrunnerregrind/regrind/issues/new"
					target="_blank">report an issue</Link
				>.
			{/if}
		</Empty.Description>
	</Empty.Header>
</Empty.Root>
