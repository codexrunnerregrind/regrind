<script lang="ts">
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";

	import { accountsState } from "$lib/api/accounts.svelte";
	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";

	let { onopen }: { onopen: () => void } = $props();

	void accountsState.load();

	// The faces of the accounts you are *not* using: the point of the control is
	// what you can switch to, and the account in use is already the card's own
	// avatar. Two is all that reads as a stack at this size, so any beyond that
	// are counted rather than dropped.
	const SHOWN = 2;
	const others = $derived(accountsState.others);
	const faces = $derived(others.slice(0, SHOWN));
	const hidden = $derived(Math.max(0, others.length - SHOWN));
	const alone = $derived(accountsState.accounts.length < 2);
</script>

<!-- A floor on the width rather than letting the content set it: "Add" is a
     third the width of two stacked faces and "Switch", and without it the panel
     collapses to the label and the divider lands far too close to the edge.
     The divider is drawn rather than a border so it can stop short of the card's
     top and bottom, the way a rule between two things should. -->
<button
	type="button"
	onclick={onopen}
	aria-label={alone ? "Add another account" : "Switch account"}
	class="relative flex min-w-20 shrink-0 flex-col items-center justify-center gap-1 px-3 transition-colors before:absolute before:inset-y-3 before:start-0 before:w-px before:bg-border active:bg-muted can-hover:hover:bg-muted"
>
	<span class="flex items-center">
		{#if alone}
			<span
				class="flex size-6.5 items-center justify-center rounded-full border border-border bg-muted"
			>
				<PlusIcon weight="bold" class="size-3.5" />
			</span>
		{:else}
			{#each faces as account, index (account.profileId)}
				<span
					class={[
						"size-6.5 overflow-hidden rounded-full bg-media-placeholder ring-2 ring-card",
						{ "-ms-2": index > 0 },
					]}
				>
					<UserAvatar
						mediaHash={account.avatar ?? null}
						class="size-full *:rounded-full"
					/>
				</span>
			{/each}
			{#if hidden > 0}
				<span
					class="-ms-2 flex size-6.5 items-center justify-center rounded-full bg-muted text-3xs font-medium text-muted-foreground ring-2 ring-card"
				>
					+{hidden}
				</span>
			{/if}
		{/if}
	</span>
	<span class="text-meta leading-none font-medium text-primary">
		{alone ? "Add" : "Switch"}
	</span>
</button>
