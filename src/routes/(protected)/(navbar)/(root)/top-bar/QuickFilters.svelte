<script lang="ts">
	import SlidersHorizontalIcon from "phosphor-svelte/lib/SlidersHorizontalIcon";
	import StarIcon from "phosphor-svelte/lib/StarIcon";

	import { genderFilterFlag } from "$lib/api/feature-flags-state.svelte";
	import CommandCenterTrigger from "$lib/components/command-center/CommandCenterTrigger.svelte";
	import {
		ACTIVE_FILTER,
		ACTIVE_FILTER_PRESSED,
	} from "$lib/components/filters/active-filter";
	import { Button, buttonVariants } from "$lib/components/ui/button";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import { defaultFilters } from "$lib/model/browse/grid/filters";
	import AgeQuickFilter from "./AgeQuickFilter.svelte";
	import PositionQuickFilter from "./PositionQuickFilter.svelte";
	import { sentFilterKeysWithoutQuickFilter } from "./quick-filters";

	let {
		openFilters = $bindable(),
	}: { openFilters: { all: boolean; age: boolean; position: boolean } } =
		$props();

	const TOGGLE_FILTER_KEYS = ["isOnline", "isRightNow", "isFresh"] as const;

	const filters = $derived(gridState.filters.value ?? defaultFilters);
	const { ageEnabled, positionEnabled, isFavorite } = $derived(filters);
	const sheetOnlyFiltersOn = $derived(
		sentFilterKeysWithoutQuickFilter({
			filters,
			genderFilterFlag: genderFilterFlag(),
		}).length > 0 ||
			(filters.usernameEnabled && filters.username.trim() !== ""),
	);
</script>

<!-- Every "on" filter in this row uses the same inverted fill, whichever kind of
     control it is: a sheet-opening button, a toggle button, or a toggle-group
     item. ACTIVE_FILTER is that one style. -->
<Button
	variant="secondary"
	aria-label="All filters"
	onclick={() => (openFilters.all = true)}
	class={{ [ACTIVE_FILTER]: sheetOnlyFiltersOn }}
>
	<SlidersHorizontalIcon />
</Button>
<Button
	variant="secondary"
	aria-label="Favorites"
	aria-pressed={isFavorite}
	onclick={() => gridState.filters.set({ isFavorite: !isFavorite })}
	class={{ [ACTIVE_FILTER]: isFavorite }}
>
	<StarIcon weight={isFavorite ? "fill" : "regular"} />
</Button>
<CommandCenterTrigger />
<Button
	variant="secondary"
	onclick={() => (openFilters.age = true)}
	class={{ [ACTIVE_FILTER]: ageEnabled }}
>
	Age
</Button>
<Button
	variant="secondary"
	onclick={() => (openFilters.position = true)}
	class={{ [ACTIVE_FILTER]: positionEnabled }}
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
		class={[
			buttonVariants({ variant: "secondary" }),
			ACTIVE_FILTER_PRESSED,
		]}
	>
		Online
	</ToggleGroup.Item>
	<ToggleGroup.Item
		value="isRightNow"
		class={[
			buttonVariants({ variant: "secondary" }),
			ACTIVE_FILTER_PRESSED,
		]}
	>
		Right now
	</ToggleGroup.Item>
	<ToggleGroup.Item
		value="isFresh"
		class={[
			buttonVariants({ variant: "secondary" }),
			ACTIVE_FILTER_PRESSED,
		]}
	>
		Fresh
	</ToggleGroup.Item>
</ToggleGroup.Root>

<AgeQuickFilter bind:open={openFilters.age} />
<PositionQuickFilter bind:open={openFilters.position} />
