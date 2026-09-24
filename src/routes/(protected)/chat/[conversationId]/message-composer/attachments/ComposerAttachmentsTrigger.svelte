<script lang="ts">
	import { PaperclipIcon } from "phosphor-svelte";
	import { expoOut } from "svelte/easing";

	import { scale } from "$lib/util/reduced-motion";
	import ComposerButton from "../ComposerButton.svelte";
	import { dropKeyboard, keepKeyboard } from "../keep-keyboard";
	import { getMessageComposerContext } from "../message-composer-context.svelte";

	let { onClick }: { onClick?: () => void } = $props();

	const { disabled } = $derived(getMessageComposerContext()());
</script>

<div
	data-slot="composer-attachments-trigger"
	class={["shrink-0", { "pointer-events-none": disabled }]}
	transition:scale={{ duration: 400, easing: expoOut, start: 0 }}
>
	<!-- The drawer wants the keyboard out of its way, but taking it down through
	     the tap that opens it leaves the button somewhere else by the time the
	     press lands. So the press holds the focus and the click that follows hands
	     it back — the keys go as the sheet comes up, which is the order the drawer
	     wanted anyway. -->
	<ComposerButton
		aria-label="Add attachment"
		onclick={() => {
			dropKeyboard();
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
