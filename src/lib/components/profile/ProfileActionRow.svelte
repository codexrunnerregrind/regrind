<script lang="ts">
	import DisplayName from "$lib/components/profile/DisplayName.svelte";
	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";

	let {
		profileId,
		name,
		mediaHash,
		actionLabel,
		actionDescription,
		disabled = false,
		onAction,
		description,
	}: {
		profileId: number;
		name: string | null;
		mediaHash: string | null;
		actionLabel: string;
		/** Accessible name for the chip, when the label alone is ambiguous. */
		actionDescription?: string;
		disabled?: boolean;
		onAction: () => void;
		description?: import("svelte").Snippet;
	} = $props();
</script>

<!-- A person and one thing you can do about them — the row shared by Blocked
     users and an album's Shared with list. Separators sit between rows rather
     than under every one, so the list ends on the last name.

     The avatar runs larger than the handoff's 42pt: these lists are how you
     recognise someone you blocked or shared with months ago, and at 42 the face
     is too small to place. -->
<div
	class="flex items-center gap-3.5 py-3.5 not-last:border-b not-last:border-border first:pt-0"
>
	<a
		href="/profile/{profileId}"
		aria-label="{name ?? 'Someone'}'s profile"
		class="shrink-0"
		tabindex="-1"
	>
		<UserAvatar
			{mediaHash}
			class="size-15 overflow-hidden rounded-full bg-media-placeholder"
			size="lg"
		/>
	</a>
	<a href="/profile/{profileId}" class="flex min-w-0 flex-1 flex-col gap-0.5">
		<DisplayName
			{name}
			class={[
				"truncate text-row",
				{
					"font-semibold": name !== null,
					"text-muted-foreground": name === null,
				},
			]}
		/>
		{@render description?.()}
	</a>
	<!-- Deliberately neutral, not destructive: undoing a block or a share is not
	     the dangerous direction. -->
	<button
		type="button"
		class="h-auto shrink-0 rounded-lg border border-border px-3.5 py-2 text-preview font-medium transition-colors disabled:opacity-50 can-hover:hover:bg-muted"
		aria-label={actionDescription}
		{disabled}
		onclick={onAction}
	>
		{actionLabel}
	</button>
</div>
