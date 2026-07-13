<script lang="ts">
	import { defaultRightNowFilters } from "$lib/components/filters/filters";
	import { Button, buttonVariants } from "$lib/components/ui/button";
	import { rightNowState } from "$lib/right-now/right-now-state.svelte";
	import AgeQuickFilter from "./AgeQuickFilter.svelte";
	import PositionQuickFilter from "./PositionQuickFilter.svelte";
    import HostingQuickFilter from "./HostingQuickFilter.svelte";

	let {
		openFilters = $bindable(),
	}: {
		openFilters: {
			age: boolean;
			position: boolean;
            hosting: boolean;
		};
	} = $props();

	const filters = $derived(rightNowState.filters.value ?? defaultRightNowFilters);
	const { ageEnabled, positionEnabled, hostingEnabled } = $derived(filters);
</script>

<!-- TODO: Sort "filter" -->
<Button
	variant="secondary"
	onclick={() => (openFilters.age = true)}
	class={{
		"bg-white hover:bg-neutral-200 text-popover": ageEnabled,
	}}
>
	Age
</Button>
<Button
	variant="secondary"
	onclick={() => (openFilters.position = true)}
	class={{
		"bg-white hover:bg-neutral-200 text-popover": positionEnabled,
	}}
>
	Position
</Button>
<Button
	variant="secondary"
	onclick={() => (openFilters.hosting = true)}
	class={{
		"bg-white hover:bg-neutral-200 text-popover": hostingEnabled,
	}}
>
	Hosting
</Button>

<AgeQuickFilter bind:open={openFilters.age} />
<PositionQuickFilter bind:open={openFilters.position} />
<HostingQuickFilter bind:open={openFilters.hosting} />
