<script lang="ts">
	import { onDestroy, untrack } from "svelte";

	import { FavoritesState } from "./favorites-state.svelte";
	import FavoritesGrid from "./FavoritesGrid.svelte";
	import FavoritesNavBar from "./FavoritesNavBar.svelte";

	// Owned here rather than in the grid: the nav bar's search field drives the
	// same state the grid renders from.
	const favorites = untrack(() => new FavoritesState());
	onDestroy(() => favorites.destroy());
</script>

<FavoritesNavBar {favorites} />
<FavoritesGrid {favorites} />
