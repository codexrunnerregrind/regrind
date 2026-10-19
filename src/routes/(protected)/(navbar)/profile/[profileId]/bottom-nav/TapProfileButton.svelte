<script lang="ts">
	import { showErrorToast } from "$lib/api/error-toast";
	import { sendTap } from "$lib/api/interest/taps";
	import TapIcon from "$lib/components/profile/TapIcon.svelte";
	import Button from "$lib/components/ui/button/button.svelte";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import { playHaptic } from "$lib/haptics";
	import { TapType, tapTypes } from "$lib/model/interest/taps";
	import { firedByTouch } from "$lib/platform/touch-origin";

	let {
		profileId,
		tapType,
		onTap,
	}: {
		profileId: number;
		tapType: TapType | null;
		onTap: (tapType: TapType | null) => void;
	} = $props();

	let customAnchor: HTMLButtonElement | null = $state(null);
	let open = $state(false);
	let sending = $state(false);

	async function send(reaction: TapType) {
		if (sending || tapType !== null) return;
		sending = true;
		try {
			onTap(reaction);
			await sendTap({ recipientId: profileId, tapType: reaction });
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to send tap", error });
			onTap(null);
		} finally {
			sending = false;
		}
	}

	const defaultTapType = TapType.Hot;

	const sent = $derived(tapType !== null);
</script>

<!-- The round action beside the field, on the media viewer's 44pt circle. The
     circle stays muted throughout — the glyph alone carries the state, going from
     a line icon (a tap you can send) to the emoji itself (the tap they got). No
     accent fill: this is a thing that happened, not the screen's primary action,
     and the emoji is already the more legible of the two. -->
<Button
	size="icon"
	variant="secondary"
	aria-label={tapType === null
		? `Send a ${tapTypes[defaultTapType]} tap`
		: `${tapTypes[tapType]} tap sent`}
	bind:ref={customAnchor}
	oncontextmenu={(e) => {
		e.preventDefault();
		if (!open && firedByTouch(e)) playHaptic("longPress");
		open = true;
	}}
	onclick={() => send(defaultTapType)}
	disabled={sent || sending}
	class={["size-11 rounded-full", { "disabled:opacity-100": sent }]}
>
	{#if tapType === null}
		<TapIcon tapType={defaultTapType} />
	{:else}
		<TapIcon {tapType} sent />
	{/if}
</Button>
{#snippet tapOption(tapType: TapType)}
	<DropdownMenu.Item
		class="w-10 px-2"
		aria-label="Send a {tapTypes[tapType]} tap"
		onclick={() => send(tapType)}
	>
		<TapIcon {tapType} />
	</DropdownMenu.Item>
{/snippet}
<DropdownMenu.Root bind:open>
	<DropdownMenu.Content
		class="w-13 min-w-0 rounded-2xl"
		align="center"
		{customAnchor}
	>
		{@render tapOption(TapType.Friendly)}
		{@render tapOption(TapType.Hot)}
		{@render tapOption(TapType.Looking)}
	</DropdownMenu.Content>
</DropdownMenu.Root>
