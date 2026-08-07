<script lang="ts">
	import type { Snippet } from "svelte";

	import { Label } from "$lib/components/ui/label";
	import { stackedLabelClass, stackedRowClass } from "./row";

	let {
		label,
		error,
		hint,
		children,
	}: { label: string; error?: string; hint?: string; children: Snippet } =
		$props();
</script>

<!-- Stacked field row: caption label above a full-width control. For controls
     too wide or tall to sit on the trailing edge of a row (text areas, chip
     pickers, the age wheel); compact values use InlineField instead. -->
<div class={stackedRowClass}>
	<div class="flex items-baseline justify-between gap-3">
		<Label class={stackedLabelClass}>{label}</Label>
		{#if error}
			<span class="shrink-0 text-caption text-destructive">{error}</span>
		{:else if hint}
			<span
				class="shrink-0 text-caption text-muted-foreground tabular-nums"
			>
				{hint}
			</span>
		{/if}
	</div>
	{@render children()}
</div>
