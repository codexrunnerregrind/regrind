<script lang="ts">
	import { CaretUpDownIcon } from "phosphor-svelte";

	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import type { Option } from "../options";
	import { inlineLabelClass, inlineRowClass, valueClass } from "./row";

	let {
		label,
		value = $bindable(),
		options,
		placeholder = "Not set",
		clearLabel = "Not set",
		nullable = true,
	}: {
		label: string;
		value: number | null;
		options: Option[];
		placeholder?: string;
		clearLabel?: string;
		nullable?: boolean;
	} = $props();

	const selected = $derived(options.find((option) => option.value === value));
</script>

<!-- The row itself is the trigger, so the whole 56px band is tappable rather
     than just a button on the trailing edge. -->
<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				type="button"
				class={[inlineRowClass, "active:bg-muted can-hover:hover:bg-muted"]}
			>
				<span class={inlineLabelClass}>{label}</span>
				<span class="ms-auto flex min-w-0 items-center gap-1">
					<span class={[valueClass, { "text-muted-foreground": !selected }]}>
						{selected?.label ?? placeholder}
					</span>
					<CaretUpDownIcon class="size-4 shrink-0 text-muted-foreground/70" />
				</span>
			</button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content class="max-h-72 w-(--bits-dropdown-menu-anchor-width)">
		<DropdownMenu.RadioGroup
			bind:value={
				() => (value === null ? "" : String(value)),
				(next) => (value = next === "" ? null : Number(next))
			}
		>
			{#if nullable}
					<DropdownMenu.RadioItem value=""
						>{clearLabel}</DropdownMenu.RadioItem
					>
			{/if}
			{#each options as option (option.value)}
				<DropdownMenu.RadioItem value={String(option.value)}>
					{option.label}
				</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
