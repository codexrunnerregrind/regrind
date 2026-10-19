<script lang="ts">
	import SortAscendingIcon from "phosphor-svelte/lib/SortAscendingIcon";

	import { Button } from "$lib/components/ui/button";
	import { defaultRightNowFilters } from "$lib/model/browse/grid/filters";
	import { rightNowState } from "$lib/right-now/right-now-state.svelte";
	import AgeQuickFilter from "./AgeQuickFilter.svelte";
	import HostingQuickFilter from "./HostingQuickFilter.svelte";
	import PositionQuickFilter from "./PositionQuickFilter.svelte";
	import SortQuickFilter from "./SortQuickFilter.svelte";

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
		"bg-foreground text-background hover:bg-foreground/90":
			sort === "NEWEST",
	}}
>
	<SortAscendingIcon />
	{sort === "NEWEST" ? "Recent" : "Distance"}
</Button>
<Button
	variant="secondary"
	onclick={() => (openFilters.age = true)}
	class={{
		"bg-foreground text-background hover:bg-foreground/90": ageEnabled,
	}}
>
	Age
</Button>
<Button
	variant="secondary"
	onclick={() => (openFilters.position = true)}
	class={{
		"bg-foreground text-background hover:bg-foreground/90": positionEnabled,
	}}
>
	Position
</Button>
<Button
	variant="secondary"
	onclick={() => (openFilters.hosting = true)}
	class={{
		"bg-foreground text-background hover:bg-foreground/90": hostingEnabled,
	}}
>
	Hosting
</Button>

<SortQuickFilter bind:open={openFilters.sort} />
<AgeQuickFilter bind:open={openFilters.age} />
<PositionQuickFilter bind:open={openFilters.position} />
<HostingQuickFilter bind:open={openFilters.hosting} />
