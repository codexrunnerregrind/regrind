<script lang="ts">
	import { expoOut } from "svelte/easing";
	import { fade } from "svelte/transition";

	import { softKeyboardVisibility } from "#lib/platform/native-insets.ts";
	import ComposerButton from "./ComposerButton.svelte";

	let {
		class: className,
		keepsSoftKeyboardUp = false,
		...props
	}: import("svelte").ComponentProps<typeof ComposerButton> & {
		keepsSoftKeyboardUp?: boolean;
	} = $props();

	function holdFieldFocus(event: Event) {
		if (keepsSoftKeyboardUp && softKeyboardVisibility() !== false)
			event.preventDefault();
	}
</script>

<div
	class="absolute inset-0"
	transition:fade={{ duration: 400, easing: expoOut }}
>
	<ComposerButton
		onpointerdown={holdFieldFocus}
		onmousedown={holdFieldFocus}
		{...props}
		class={[
			"rounded-full bg-primary text-primary-foreground hover:bg-primary/90",
			// Reach into the composer's padding so a near-miss still counts
			"relative after:absolute after:-inset-2 after:content-['']",
			className,
		]}
	/>
</div>
