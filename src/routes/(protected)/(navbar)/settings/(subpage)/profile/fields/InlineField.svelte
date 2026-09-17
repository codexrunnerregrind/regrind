<script lang="ts">
	import type { Snippet } from "svelte";

	import { Label } from "$lib/components/ui/label";
	import { revealFieldUnderKeyboard } from "$lib/util/scroll";
	import { inlineLabelClass, inlineRowClass } from "./row";

	let {
		label,
		icon,
		control,
	}: { label: string; icon?: Snippet; control: Snippet<[{ id: string }]> } =
		$props();

	const id = $props.id();
</script>

<!-- Inline field row: label on the leading edge, control on the trailing one.
     Keeps single-value settings (a number, a choice, a switch) to one line each
     so a long form scans as a list instead of a stack of boxes. -->
<div
	class={inlineRowClass}
	onfocusin={(event) => revealFieldUnderKeyboard(event.currentTarget)}
>
	{#if icon}
		<span class="flex shrink-0 items-center text-muted-foreground">
			{@render icon()}
		</span>
	{/if}
	<Label class={inlineLabelClass} for={id}>{label}</Label>
	<div class="ms-auto flex min-w-0 items-center justify-end gap-1">
		{@render control({ id })}
	</div>
</div>
