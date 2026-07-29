<script lang="ts">
	import { SlidersHorizontalIcon, StarIcon } from "phosphor-svelte";

	import { defaultFilters } from "$lib/components/filters/filters";
	import { Button, buttonVariants } from "$lib/components/ui/button";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import AgeQuickFilter from "./AgeQuickFilter.svelte";
	import PositionQuickFilter from "./PositionQuickFilter.svelte";

	let {
		openFilters = $bindable(),
	}: {
		openFilters: {
			all: boolean;
			age: boolean;
			position: boolean;
		};
	} = $props();

	const TOGGLE_FILTER_KEYS = ["isOnline", "isRightNow", "isFresh"] as const;

	const filters = $derived(gridState.filters.value ?? defaultFilters);
	const { ageEnabled, positionEnabled, isFavorite } = $derived(filters);
</script>

<Button variant="secondary" onclick={() => (openFilters.all = true)}>
	<SlidersHorizontalIcon />
</Button>
<Button
	variant="secondary"
	aria-label="Favorites"
	aria-pressed={isFavorite}
	onclick={() => gridState.filters.set({ isFavorite: !isFavorite })}
	class={{
		"bg-foreground text-background hover:bg-foreground/90": isFavorite,
	}}
>
	<StarIcon />
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
<ToggleGroup.Root
	type="multiple"
	variant="default"
	bind:value={
		() => TOGGLE_FILTER_KEYS.filter((key) => filters[key]),
		(values: (typeof TOGGLE_FILTER_KEYS)[number][]) => {
			gridState.filters.set({
				isOnline: values.includes("isOnline"),
				isRightNow: values.includes("isRightNow"),
				isFresh: values.includes("isFresh"),
			});
		}
	}
	size="sm"
	class="h-9"
>
	<ToggleGroup.Item
		value="isOnline"
		class={buttonVariants({ variant: "secondary" })}
	>
		Online
	</ToggleGroup.Item>
	<ToggleGroup.Item
		value="isRightNow"
		class={buttonVariants({ variant: "secondary" })}
	>
		Right now
	</ToggleGroup.Item>
	<ToggleGroup.Item
		value="isFresh"
		class={buttonVariants({ variant: "secondary" })}
	>
		Fresh
	</ToggleGroup.Item>
</ToggleGroup.Root>

<AgeQuickFilter bind:open={openFilters.age} />
<PositionQuickFilter bind:open={openFilters.position} />
