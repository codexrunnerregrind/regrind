<script lang="ts">
	import { PaperclipIcon } from "phosphor-svelte";
	import { expoOut } from "svelte/easing";
	import { scale } from "svelte/transition";

	import ComposerButton from "../ComposerButton.svelte";
	import { getMessageComposerContext } from "../message-composer-context.svelte";

	let {
		onClick,
	}: {
		onClick?: () => void;
	} = $props();

	const { disabled } = $derived(getMessageComposerContext()());
</script>

<div
	class={["shrink-0", { "pointer-events-none": disabled }]}
	transition:scale={{ duration: 400, easing: expoOut, start: 0 }}
>
	<ComposerButton
		aria-label="Add attachment"
		onclick={() => {
			onClick?.();
		}}
		{disabled}
	>
		{#snippet icon({ ...props })}
			<PaperclipIcon {...props} class="size-5" />
		{/snippet}
	</ComposerButton>
</div>
