<script lang="ts">
	import CommandCenterTrigger from "$lib/components/command-center/CommandCenterTrigger.svelte";
	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import type { FavoriteSearch } from "$lib/favorites/favorite-search.svelte";
	import FavoriteNoteSearch from "../FavoriteNoteSearch.svelte";
	import GridFilters from "../GridFilters.svelte";
	import LocationChange from "../LocationChange.svelte";
	import QuickFilters from "./QuickFilters.svelte";

	let {
		search,
		searchHidden = false,
	}: { search: FavoriteSearch; searchHidden?: boolean } = $props();

	let openFilters = $state({
		all: false,
		age: false,
		position: false,
	});

	const showingFavorites = $derived(
		gridState.filters.value?.isFavorite ?? false,
	);

	// Leaving the favorites filter takes the search with it, so the grid does not
	// stay filtered by a query whose field is no longer on screen.
	$effect(() => {
		if (!showingFavorites) search.clear();
	});

	// Scrolling with the field focused (and the keyboard up on mobile) must not
	// collapse it out from under the cursor.
	let focused = $state(false);
	const collapsed = $derived(searchHidden && !focused);
</script>

<ProgressiveBlur
	data-fixed-header
	class="fixed top-0 left-0 z-10 w-full"
	bgClass="bg-linear-to-b from-background to-transparent"
	contentClass="flex flex-col pt-fixed-header"
	direction="topToBottom"
>
	<div class="scrollbar-thin flex gap-0.5 overflow-x-auto p-4 pt-0">
		<LocationChange />
		<QuickFilters bind:openFilters />
		<CommandCenterTrigger />
	</div>
	{#if showingFavorites}
		<!-- Only opacity and transform animate, and the row keeps its height either
		     way: laying the header out again mid-animation would re-rasterise the
		     nine backdrop-filter layers behind it every frame, which stutters.
		     The row it leaves behind costs nothing — the grid scrolls under the
		     blur, so cards fill it, and at the top of the list the field is back. -->
		<div
			class={[
				"transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
				{
					"pointer-events-none -translate-y-1.5 opacity-0": collapsed,
					"translate-y-0 opacity-100": !collapsed,
				},
			]}
			inert={collapsed}
			onfocusin={() => (focused = true)}
			onfocusout={() => (focused = false)}
		>
			<FavoriteNoteSearch {search} />
		</div>
	{/if}
</ProgressiveBlur>
<GridFilters bind:open={openFilters.all} />
