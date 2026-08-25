<script lang="ts">
	import { CheckCircleIcon } from "phosphor-svelte";

	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import type { AccountSummary } from "$lib/api/accounts.svelte";

	let {
		account,
		title,
		detail,
		disabled = false,
		onclick,
	}: {
		account: AccountSummary;
		title: string;
		detail: string;
		disabled?: boolean;
		onclick?: () => void;
	} = $props();

	// A row for the active account is not a button: there is nowhere to switch
	// to, and a pressable row that does nothing reads as broken.
	const interactive = $derived(onclick !== undefined && !disabled);
</script>

<!-- Deliberately not SettingsRow: its glyph slot is a 17pt tile, which a face
     cannot live in. Everything else — the 56pt minimum, the 14pt gutter, the
     type scale — matches, so the row still belongs to the group around it. -->
<svelte:element
	this={onclick === undefined ? "div" : "button"}
	type={onclick === undefined ? undefined : "button"}
	disabled={onclick === undefined || !disabled ? undefined : true}
	aria-disabled={disabled ? "true" : undefined}
	aria-current={account.active ? "true" : undefined}
	role={onclick === undefined ? "group" : undefined}
	onclick={interactive ? onclick : undefined}
	class={[
		"flex min-h-14 w-full items-center gap-3.5 px-4 py-3 text-start transition-colors",
		"outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
		{
			"cursor-pointer active:bg-muted can-hover:hover:bg-muted":
				interactive,
			"opacity-55": disabled,
		},
	]}
>
	<!-- The face is fetched through the media proxy on the *active* account's
	     session, so drawing a background account's avatar costs that account
	     nothing and leaves it offline. An account that has never been switched to
	     has no avatar yet and falls back to the placeholder glyph. -->
	<span
		class="size-9 shrink-0 overflow-hidden rounded-full bg-media-placeholder"
	>
		<UserAvatar
			mediaHash={account.avatar ?? null}
			class="size-full *:rounded-full"
		/>
	</span>
	<span class="flex min-w-0 flex-1 flex-col gap-0.5">
		<span class="truncate font-heading text-row leading-snug font-medium">
			{title}
		</span>
		<span class="truncate text-caption leading-snug text-muted-foreground">
			{detail}
		</span>
	</span>
	{#if account.active}
		<CheckCircleIcon
			weight="fill"
			class="size-5 shrink-0 text-primary"
			aria-label="In use"
		/>
	{/if}
</svelte:element>
