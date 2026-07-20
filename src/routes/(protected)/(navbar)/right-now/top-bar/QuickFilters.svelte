<script lang="ts">
	import { defaultRightNowFilters } from "$lib/components/filters/filters";
	import { Button } from "$lib/components/ui/button";
	import { rightNowState } from "$lib/right-now/right-now-state.svelte";
	import SortQuickFilter from "./SortQuickFilter.svelte";
	import AgeQuickFilter from "./AgeQuickFilter.svelte";
	import PositionQuickFilter from "./PositionQuickFilter.svelte";
	import HostingQuickFilter from "./HostingQuickFilter.svelte";
	import { SortAscendingIcon } from "phosphor-svelte";

	let {
		openFilters = $bindable(),
	}: {
		openFilters: {
			sort: boolean;
			age: boolean;
			position: boolean;
			hosting: boolean;
		};
	} = $props();

	const filters = $derived(
		rightNowState.filters.value ?? defaultRightNowFilters,
	);
	const { ageEnabled, positionEnabled, hostingEnabled, sort } =
		$derived(filters);
</script>

<Button
	variant="secondary"
	onclick={() => (openFilters.sort = true)}
	class={{
		"bg-white text-popover hover:bg-neutral-200": sort === "NEWEST",
	}}
>
	<SortAscendingIcon />
	{sort === "NEWEST" ? "Recent" : "Distance"}
</Button>
<Button
	variant="secondary"
	onclick={() => (openFilters.age = true)}
	class={{
		"bg-white text-popover hover:bg-neutral-200": ageEnabled,
	}}
>
	Age
</Button>
<Button
	variant="secondary"
	onclick={() => (openFilters.position = true)}
	class={{
		"bg-white text-popover hover:bg-neutral-200": positionEnabled,
	}}
>
	Position
</Button>
<Button
	variant="secondary"
	onclick={() => (openFilters.hosting = true)}
	class={{
		"bg-white text-popover hover:bg-neutral-200": hostingEnabled,
	}}
>
	Hosting
</Button>

<SortQuickFilter bind:open={openFilters.sort} />
<AgeQuickFilter bind:open={openFilters.age} />
<PositionQuickFilter bind:open={openFilters.position} />
<HostingQuickFilter bind:open={openFilters.hosting} />
