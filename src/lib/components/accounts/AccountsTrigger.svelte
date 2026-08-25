<script lang="ts">
	import { PlusIcon } from "phosphor-svelte";

	import { accountsState } from "$lib/api/accounts.svelte";
	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";

	let { onopen }: { onopen: () => void } = $props();

	void accountsState.load();

	// The faces of the accounts you are *not* using: the point of the control is
	// what you can switch to, and the account in use is already the card's own
	// avatar. Two is enough to read as a stack at this size.
	const others = $derived(accountsState.others.slice(0, 2));
	const alone = $derived(accountsState.accounts.length < 2);
</script>

<button
	type="button"
	onclick={onopen}
	aria-label={alone ? "Add another account" : "Switch account"}
	class="flex shrink-0 flex-col items-center justify-center gap-1 border-s border-border px-3.5 transition-colors active:bg-muted can-hover:hover:bg-muted"
>
	<span class="flex items-center">
		{#if alone}
			<span
				class="flex size-6.5 items-center justify-center rounded-full border border-border bg-muted"
			>
				<PlusIcon weight="bold" class="size-3.5" />
			</span>
		{:else}
			{#each others as account, index (account.profileId)}
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
		{/if}
	</span>
	<span class="text-caption leading-none font-medium text-primary">
		{alone ? "Add" : "Switch"}
	</span>
</button>
