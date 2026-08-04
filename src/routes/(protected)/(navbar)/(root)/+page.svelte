<script lang="ts">
	import { fetchCurrentGeohash, geoApiSupported } from "$lib/app-data/location";
	import {
		getActiveGeohashSnapshot,
		getCurrentGeohashSnapshot,
		getUsingCurrentLocationSnapshot,
		hydratePreferences,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import { FavoriteSearch } from "$lib/favorites/favorite-search.svelte";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import Grid from "./Grid.svelte";
	import LocationChooser from "./LocationEmpty.svelte";
	import TopBar from "./top-bar/TopBar.svelte";

	const preferencesHydrated = hydratePreferences();
	const geohash = $derived(getActiveGeohashSnapshot());

	// Pull-to-refresh. In "current location" mode we first re-detect the device
	// position (silently — never prompting) so moving physically updates the
	// grid; if it changed, Grid's effect reloads at the new location and we skip
	// the redundant reload. In mock mode the location is left untouched.
	async function refreshGrid() {
		if (getUsingCurrentLocationSnapshot() && geoApiSupported()) {
			try {
				const detected = await fetchCurrentGeohash(false);
				if (detected !== getCurrentGeohashSnapshot()) {
					await setPreferences({ currentGeohash: detected });
					return;
				}
			} catch (error) {
				console.error(error);
			}
		}
		favoriteSearch.invalidate();
		await gridState.refresh();
	}

	// Owned here so the top bar's search field and the grid below it are the same
	// search: the field is in the header, the results replace the grid.
	const favoriteSearch = new FavoriteSearch();

	// The header grows by a row when the favorites filter adds the search field,
	// so the scroller has to clear more of it or the first cards sit underneath.
	const searchable = $derived(gridState.filters.value?.isFavorite ?? false);

	let gridContainer: HTMLElement | null = $state(null);

	let scrollRestored = false;
	$effect(() => {
		if (
			!scrollRestored &&
			gridContainer &&
			!gridState.loading &&
			gridState.error === null
		) {
			scrollRestored = true;
			gridContainer.scrollTop = gridState.scrollY;
		}
	});
</script>

<svelte:head>
	<title>Open Grind</title>
</svelte:head>
{#await preferencesHydrated then}
	{#if geohash === null}
		<main class="m-auto flex max-w-full flex-1">
			<LocationChooser />
		</main>
	{:else}
		<main class="screen-nav-host">
			<TopBar search={favoriteSearch} />
			<div
				class="pull-scroller"
				bind:this={gridContainer}
				onscroll={() => (gridState.scrollY = gridContainer?.scrollTop ?? 0)}
			>
				<div
					class={[
						"@container/photo-grid flex min-h-overscrollable flex-col gap-4 pb-nav-clear",
						searchable ? "pt-28" : "pt-17",
					]}
				>
					<Grid {geohash} search={favoriteSearch} />
				</div>
			</div>
			{#if !gridState.loading && !gridState.error}
				<DataRefreshControl
					container={gridContainer}
					updating={gridState.refreshing}
					position="top"
					onrefresh={() => void refreshGrid()}
				/>
			{/if}
		</main>
	{/if}
{/await}
