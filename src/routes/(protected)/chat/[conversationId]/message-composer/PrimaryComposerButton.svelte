<script lang="ts">
	import { expoOut } from "svelte/easing";
	import { fade } from "svelte/transition";

	import ComposerButton from "./ComposerButton.svelte";

	let {
		class: className,
		...props
	}: import("svelte").ComponentProps<typeof ComposerButton> = $props();
</script>

<div
	class="absolute inset-0"
	transition:fade={{ duration: 400, easing: expoOut }}
>
	<ComposerButton
		{...props}
		class={[
			"rounded-full bg-primary text-primary-foreground hover:bg-primary/90",
			// Reach into the composer's padding so a near-miss still counts
			"relative after:absolute after:-inset-2 after:content-['']",
			className,
		]}
	/>
</div>
