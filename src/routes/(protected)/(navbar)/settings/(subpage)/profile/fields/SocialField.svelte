<script lang="ts">
	import type { Component } from "svelte";

	import { Input } from "$lib/components/ui/input";
	import InlineField from "./InlineField.svelte";
	import { bareInputClass } from "./row";

	let {
		label,
		value = $bindable(),
		icon: Icon,
		maxLength = 64,
	}: {
		label: string;
		value: string | null;
		icon?: Component<{ class?: string }>;
		maxLength?: number;
	} = $props();
</script>

<InlineField {label}>
	{#snippet icon()}
		{#if Icon}
			<Icon class="size-4.5" />
		{/if}
	{/snippet}
	<Input
		bind:value={
			() => value ?? "",
			(newValue: string) =>
				(value = newValue.trim() === "" ? null : newValue.trim())
		}
		maxlength={maxLength}
		placeholder="username"
		autocapitalize="off"
		autocomplete="off"
		spellcheck={false}
		aria-label={label}
		class={[bareInputClass, "w-36"]}
	/>
</InlineField>
