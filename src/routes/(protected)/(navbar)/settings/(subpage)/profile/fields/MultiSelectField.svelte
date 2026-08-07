<script lang="ts">
	import { CaretUpDownIcon } from "phosphor-svelte";

	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import type { Option } from "../options";
	import { inlineLabelClass, inlineRowClass, valueClass } from "./row";

	let {
		label,
		values = $bindable(),
		options,
		placeholder = "Not set",
	}: {
		label: string;
		values: number[];
		options: Option[];
		placeholder?: string;
	} = $props();

	const selectedLabels = $derived(
		options
			.filter((option) => values.includes(option.value))
			.map((option) => option.label),
	);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				type="button"
				class={[
					inlineRowClass,
					"active:bg-muted can-hover:hover:bg-muted",
				]}
			>
				<span class={inlineLabelClass}>{label}</span>
				<span class="ms-auto flex min-w-0 items-center gap-1">
					<span
						class={[
							valueClass,
							"text-end",
							{ "text-muted-foreground": !selectedLabels.length },
						]}
					>
						{selectedLabels.length
							? selectedLabels.join(", ")
							: placeholder}
					</span>
					<CaretUpDownIcon
						class="size-4 shrink-0 text-muted-foreground/70"
					/>
				</span>
			</button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content
		class="max-h-72 w-(--bits-dropdown-menu-anchor-width)"
	>
		<DropdownMenu.CheckboxGroup
			bind:value={
				() => values.map(String),
				(newValue: string[]) => {
					values = newValue.map(Number);
				}
			}
		>
			{#each options as option (option.value)}
				<DropdownMenu.CheckboxItem
					value={String(option.value)}
					closeOnSelect={false}
				>
					{option.label}
				</DropdownMenu.CheckboxItem>
			{/each}
		</DropdownMenu.CheckboxGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
