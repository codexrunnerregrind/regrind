<script lang="ts">
	import { PaperclipIcon } from "phosphor-svelte";
	import { expoOut } from "svelte/easing";
	import { scale } from "svelte/transition";

	import ComposerButton from "../ComposerButton.svelte";
	import { keepKeyboard } from "../keep-keyboard";
	import { getMessageComposerContext } from "../message-composer-context.svelte";

	let { onClick }: { onClick?: () => void } = $props();

	const { disabled } = $derived(getMessageComposerContext()());
</script>

<div
	data-slot="composer-attachments-trigger"
	class={["shrink-0", { "pointer-events-none": disabled }]}
	transition:scale={{ duration: 400, easing: expoOut, start: 0 }}
>
	<!-- The drawer is welcome to take the keyboard down once it is up; what it
	     must not do is take it down through the tap that opens it, which leaves
	     the button somewhere else by the time the press lands. -->
	<ComposerButton
		aria-label="Add attachment"
		onclick={() => {
			onClick?.();
		}}
		onpointerdown={keepKeyboard}
		onmousedown={keepKeyboard}
		{disabled}
	>
		{#snippet icon({ ...props })}
			<PaperclipIcon {...props} class="size-5" />
		{/snippet}
	</ComposerButton>
</div>
