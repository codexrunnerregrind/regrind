<script lang="ts">
	import CommandCenterTrigger from "$lib/components/command-center/CommandCenterTrigger.svelte";
	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import type { FavoriteSearch } from "$lib/favorites/favorite-search.svelte";
	import FavoriteNoteSearch from "../FavoriteNoteSearch.svelte";
	import GridFilters from "../GridFilters.svelte";
	import LocationChange from "../LocationChange.svelte";
	import QuickFilters from "./QuickFilters.svelte";

	let { search }: { search: FavoriteSearch } = $props();

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
		<FavoriteNoteSearch {search} />
	{/if}
</ProgressiveBlur>
<GridFilters bind:open={openFilters.all} />
