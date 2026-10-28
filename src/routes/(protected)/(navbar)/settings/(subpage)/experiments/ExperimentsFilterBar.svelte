<script lang="ts">
	import FlagIcon from "phosphor-svelte/lib/FlagIcon";
	import FlaskIcon from "phosphor-svelte/lib/FlaskIcon";
	import InfoIcon from "phosphor-svelte/lib/InfoIcon";
	import { onDestroy } from "svelte";

	import { ACTIVE_FILTER_PRESSED } from "$lib/components/filters/active-filter";
	import { buttonVariants } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import {
		DefaultFilters,
		experimentsState,
	} from "./experiments-state.svelte";
	import ExperimentsInfoSheet from "./ExperimentsInfoSheet.svelte";

	const TOGGLE_FILTER_KEYS = ["flags", "experiments"] as const;

	const filters = $derived(experimentsState.filters);

	let keyPartial = $state("");
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let infoOpen = $state(false);

	function updateFilterKey() {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			debounceTimer = null;
			experimentsState.setFilters({ key: keyPartial.trim() });
		}, 300);
	}

	onDestroy(() => {
		if (debounceTimer) clearTimeout(debounceTimer);
		experimentsState.setFilters(DefaultFilters);
	});
</script>

<div
	class="sticky top-16 left-0 z-1 flex w-full items-center gap-2 bg-background/85 py-2 backdrop-blur-sm"
>
	<ToggleGroup.Root
		type="multiple"
		variant="default"
		bind:value={
			() => TOGGLE_FILTER_KEYS.filter((key) => filters[key]),
			(values) => {
				experimentsState.setFilters({
					flags: values.includes("flags"),
					experiments: values.includes("experiments"),
				});
			}
		}
		size="sm"
		class="h-9"
	>
		<ToggleGroup.Item
			value="experiments"
			class={[
				buttonVariants({ variant: "secondary" }),
				ACTIVE_FILTER_PRESSED,
			]}
		>
			<FlaskIcon size={10} weight="fill" />
		</ToggleGroup.Item>
		<ToggleGroup.Item
			value="flags"
			class={[
				buttonVariants({ variant: "secondary" }),
				ACTIVE_FILTER_PRESSED,
			]}
		>
			<FlagIcon size={10} weight="fill" />
		</ToggleGroup.Item>
	</ToggleGroup.Root>

	<Input
		aria-label="key name"
		placeholder="Key name"
		bind:value={keyPartial}
		onkeyup={updateFilterKey}
	/>

	<button
		type="button"
		aria-label="What are Grindr experiments"
		class="-m-1 flex size-7 shrink-0 items-center justify-center text-muted-foreground"
		onclick={() => (infoOpen = true)}
	>
		<InfoIcon size={20} />
	</button>
</div>

<ExperimentsInfoSheet bind:open={infoOpen} />
