<script lang="ts">
	import type { Snippet } from "svelte";

	import { inlineLabelClass, inlineRowClass } from "./row";

	let {
		label,
		icon,
		children,
	}: { label: string; icon?: Snippet; children: Snippet } = $props();
</script>

<!-- Inline field row: label on the leading edge, control on the trailing one.
     Keeps single-value settings (a number, a choice, a switch) to one line each
     so a long form scans as a list instead of a stack of boxes. -->
<div class={inlineRowClass}>
	{#if icon}
		<span class="flex shrink-0 items-center text-muted-foreground">
			{@render icon()}
		</span>
	{/if}
	<span class={inlineLabelClass}>{label}</span>
	<div class="ms-auto flex min-w-0 items-center justify-end gap-1">
		{@render children()}
	</div>
</div>
