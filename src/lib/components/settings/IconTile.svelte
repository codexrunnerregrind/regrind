<script lang="ts">
	import { type Tint, tintForeground, tints } from "./tints";

	let {
		children,
		tint = "slate",
	}: {
		children: import("svelte").Snippet;
		tint?: Tint;
	} = $props();
</script>

<!-- Rounded colour tile behind a settings row's glyph. Keeps every row scannable
     by colour and gives the list its structure at a glance. -->
<span
	class="flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4.5"
	style="background-color: {tints[tint]}; color: {tintForeground(tint)}"
>
	{@render children()}
</span>
