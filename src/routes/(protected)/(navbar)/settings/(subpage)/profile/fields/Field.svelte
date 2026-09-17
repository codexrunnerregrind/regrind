<script lang="ts">
	import type { Snippet } from "svelte";

	import { Label } from "$lib/components/ui/label";
	import { revealFieldUnderKeyboard } from "$lib/util/scroll";
	import { stackedLabelClass, stackedRowClass } from "./row";

	let {
		label,
		error,
		hint,
		control,
		picker,
	}: { label: string; error?: string; hint?: string } & (
		| { control: Snippet<[{ id: string }]>; picker?: never }
		| { picker: Snippet<[{ labelId: string }]>; control?: never }
	) = $props();

	const id = $props.id();
</script>

<!-- Stacked field row: caption label above a full-width control. For controls
     too wide or tall to sit on the trailing edge of a row (text areas, chip
     pickers, the age wheel); compact values use InlineField instead. -->
<div
	class={stackedRowClass}
	onfocusin={(event) => revealFieldUnderKeyboard(event.currentTarget)}
>
	<div class="flex items-baseline justify-between gap-3">
		<Label
			class={stackedLabelClass}
			for={control ? id : undefined}
			id={picker ? id : undefined}
		>
			{label}
		</Label>
		{#if error}
			<span
				data-slot="field-error"
				class="shrink-0 text-caption text-destructive"
			>
				{error}
			</span>
		{:else if hint}
			<span
				data-slot="field-hint"
				class="shrink-0 text-caption text-muted-foreground tabular-nums"
			>
				{hint}
			</span>
		{/if}
	</div>
	{@render control?.({ id })}
	{@render picker?.({ labelId: id })}
</div>
