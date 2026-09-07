<script lang="ts" generics="T extends unknown">
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import FilterDropdown from "./FilterDropdown.svelte";

	let {
		checked = $bindable(),
		value = $bindable(),
		id,
		label,
		items,
		convert,
		notSpecified = false,
	}: {
		checked: boolean;
		value: T[];
		id: string;
		label: string;
		items: { value: T; label: string }[];
		convert: (v: string) => T;
		notSpecified?: boolean;
	} = $props();

	const allItems = $derived(
		notSpecified
			? [...items, { value: convert("-1"), label: "Not specified" }]
			: items,
	);

	// Name the picks while they still fit on the row; past that, count them.
	const endLabel = $derived.by(() => {
		const selected = value.map(
			(v) =>
				allItems.find((item) => String(item.value) === String(v))
					?.label ?? String(v),
		);
		const joined = selected.join(", ");
		return selected.length > 2 || joined.length > 22
			? `${selected.length} selected`
			: joined;
	});
</script>

<FilterDropdown
	{id}
	{label}
	{endLabel}
	bind:checked={
		() => checked,
		(v: boolean) => {
			checked = v;
			if (!v) {
				value = [];
			}
		}
	}
>
	<ToggleGroup.Root
		type="multiple"
		variant="outline"
		spacing={2}
		class="w-full flex-wrap gap-1"
		bind:value={
			() => value.map(String),
			(v: string[]) => (
				(checked = v.length > 0),
				(value = v.map(convert))
			)
		}
	>
		{#each allItems as { value, label } (value)}
			<ToggleGroup.Item value={String(value)}>{label}</ToggleGroup.Item>
		{/each}
	</ToggleGroup.Root>
</FilterDropdown>
