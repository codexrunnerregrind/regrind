<script lang="ts" generics="T extends string">
	import * as ToggleGroup from "$lib/components/ui/toggle-group";

	let {
		options,
		value = $bindable(),
		stacked = false,
	}: {
		options: {
			value: T;
			label: string;
			icon?: typeof import("phosphor-svelte").SunIcon;
		}[];
		value: T;
		/** Stack the icon above the label instead of sitting inline with it. */
		stacked?: boolean;
	} = $props();
</script>

<!-- Segmented control: one recessed track with flush segments, the active one
     lifted onto the card surface. spacing=0 keeps the segments joined; the
     per-item classes override the toggle group's default inverted active state. -->
<ToggleGroup.Root
	type="single"
	spacing={0}
	class="flex w-full gap-0 rounded-lg bg-muted p-1"
	bind:value={
		() => value,
		(next: string) => {
			// The toggle group emits "" when the active segment is re-pressed; a
			// segmented control has no empty state, so only accept a known option
			// and otherwise keep the current value.
			const match = options.find((option) => option.value === next);
			if (match) value = match.value;
		}
	}
>
	{#each options as option (option.value)}
		<ToggleGroup.Item
			value={option.value}
			class={[
				"h-auto flex-1 rounded-md px-2 text-muted-foreground",
				"data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm",
				{ "flex-col gap-1.5 py-2.5": stacked, "gap-2 py-2": !stacked },
			]}
		>
			{#if option.icon}
				<option.icon weight="fill" class="size-5" />
			{/if}
			<span class="truncate text-caption font-medium">{option.label}</span
			>
		</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
