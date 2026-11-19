<script lang="ts">
	import { Input } from "#lib/components/ui/input/index.ts";
	import { formatInteger } from "#lib/i18n/format.ts";
	import Field from "./Field.svelte";

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
</script>

<Field {label} hint="{formatInteger(value.length)}/{formatInteger(maxLength)}">
	{#snippet control({ id })}
		<Input
			{id}
			bind:value
			{placeholder}
			maxlength={maxLength}
			class="rounded-lg"
		/>
	{/snippet}
</Field>
