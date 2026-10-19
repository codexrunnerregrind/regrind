<script lang="ts">
	import StickerIcon from "phosphor-svelte/lib/StickerIcon";

	import ComposerButton from "../ComposerButton.svelte";
	import { getMessageComposerContext } from "../message-composer-context.svelte";

	let {
		onClick,
		ref = $bindable(null),
	}: { onClick: () => void; ref?: HTMLElement | null } = $props();

	const { disabled } = $derived(getMessageComposerContext()());
</script>

<ComposerButton
	bind:ref
	variant="ghost"
	class="size-8 text-muted-foreground hover:bg-transparent"
	aria-label="GIFs and stickers"
	onclick={onClick}
	{disabled}
>
	{#snippet icon({ ...props })}
		<StickerIcon {...props} class="size-5.5" />
	{/snippet}
</ComposerButton>
