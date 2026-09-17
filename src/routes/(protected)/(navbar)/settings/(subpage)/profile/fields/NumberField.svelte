<script lang="ts">
	import { untrack } from "svelte";

	import { Input } from "$lib/components/ui/input";
	import InlineField from "./InlineField.svelte";
	import { bareInputClass } from "./row";

	let {
		label,
		value = $bindable(),
		min,
		max,
		step = 1,
		unit,
		placeholder,
	}: {
		label: string;
		value: number | null;
		min: number;
		max: number;
		step?: number;
		unit?: string;
		placeholder?: string;
	} = $props();

	const allowsDecimal = $derived(step % 1 !== 0);
	let text = $state(value === null ? "" : String(value));
	let focused = $state(false);

	$effect(() => {
		const current = value;
		if (focused) return;
		untrack(() => {
			const formatted = current === null ? "" : String(current);
			if (text !== formatted) text = formatted;
		});
	});

	function sanitize(raw: string) {
		const cleaned = raw.replace(allowsDecimal ? /[^0-9.]/g : /[^0-9]/g, "");
		if (!allowsDecimal) return cleaned;
		const firstDot = cleaned.indexOf(".");
		if (firstDot === -1) return cleaned;
		return (
			cleaned.slice(0, firstDot + 1) +
			cleaned.slice(firstDot + 1).replace(/\./g, "")
		);
	}

	function handleInput() {
		text = sanitize(text);
		if (text === "") {
			value = null;
			return;
		}
		const parsed = Number(text);
		if (!Number.isNaN(parsed)) value = parsed;
	}

	function commit() {
		focused = false;
		if (value === null) {
			text = "";
			return;
		}
		value = Math.min(max, Math.max(min, value));
		text = String(value);
	}
</script>

<InlineField {label}>
	{#snippet control({ id })}
		<Input
			{id}
			type="text"
			inputmode={allowsDecimal ? "decimal" : "numeric"}
			bind:value={text}
			oninput={handleInput}
			onfocus={() => (focused = true)}
			onblur={commit}
			{placeholder}
			class={[bareInputClass, "w-20"]}
		/>
		{#if unit}
			<span class="shrink-0 text-body text-muted-foreground">{unit}</span>
		{/if}
	{/snippet}
</InlineField>
