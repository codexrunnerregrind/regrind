<script lang="ts">
	import { Label } from "$lib/components/ui/label";
	import { Textarea } from "$lib/components/ui/textarea";
	import { stackedLabelClass, stackedRowClass } from "./row";

	let {
		label,
		value = $bindable(),
		maxLength,
		placeholder,
	}: {
		label: string;
		value: string;
		maxLength: number;
		placeholder?: string;
	} = $props();

	const remaining = $derived(maxLength - value.length);
	const over = $derived(remaining < 0);
</script>

<div class={stackedRowClass}>
	<div class="flex items-baseline justify-between gap-3">
		<Label class={stackedLabelClass}>{label}</Label>
		<span
			class={[
				"shrink-0 text-caption tabular-nums",
				{ "text-destructive": over, "text-muted-foreground": !over },
			]}
		>
			{remaining}
		</span>
	</div>
	<Textarea
		bind:value
		{placeholder}
		aria-invalid={over}
		class="min-h-24 rounded-lg"
	/>
	{#if over}
		<span class="text-caption text-destructive"
			>Too long, please shorten</span
		>
	{/if}
</div>
