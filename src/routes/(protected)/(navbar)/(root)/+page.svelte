<script lang="ts">
	import {
		fetchCurrentGeohash,
		geoApiSupported,
	} from "$lib/app-data/location";
	import {
		getActiveGeohashSnapshot,
		getCurrentGeohashSnapshot,
		getUsingCurrentLocationSnapshot,
		hydratePreferences,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import ScrollToTopButton from "$lib/components/shared/ScrollToTopButton.svelte";
	import { FavoriteSearch } from "$lib/favorites/favorite-search.svelte";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import { restoreScrollOnce } from "$lib/util/scroll-restore.svelte";
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
		await gridState.refresh({ keepLoadedPages: false });
	}

	// Owned here so the top bar's search field and the grid below it are the same
	// search: the field is in the header, the results replace the grid.
	const favoriteSearch = new FavoriteSearch();

	// The header grows by a row when the favorites filter adds the search field,
	// so the scroller has to clear more of it or the first cards sit underneath.
	const searchable = $derived(gridState.filters.value?.isFavorite ?? false);

	let gridContainer: HTMLElement | null = $state(null);

	// The notes field is secondary chrome: it fades out of the way once the user
	// starts reading down the grid and comes back as soon as they scroll back up.
	// It stays put while a query is running — hiding the field someone is
	// searching with, and the only way to clear it, would be worse than the space
	// it saves.
	let scrolledPastSearch = $state(false);
	let lastScrollY = 0;
	const hideSearch = $derived(
		searchable && scrolledPastSearch && !favoriteSearch.active,
	);

	// A new filter selection scrolls the grid back to the top, so the field it
	// may have just added starts shown.
	$effect(() => {
		void searchable;
		scrolledPastSearch = false;
		lastScrollY = 0;
	});

	function onGridScroll() {
		const container = gridContainer;
		if (!container) return;
		const y = container.scrollTop;
		gridState.scrollY = y;

		// Small deltas are left to accumulate rather than flipping the field on
		// every jitter of a finger resting on the screen, or on the overscroll a
		// rubber band walks back through.
		const delta = y - lastScrollY;
		if (Math.abs(delta) < 12) return;
		lastScrollY = y;

		if (y <= 8) scrolledPastSearch = false;
		else scrolledPastSearch = delta > 0;
	}

	restoreScrollOnce({ container: () => gridContainer, state: gridState });

	$effect(() =>
		gridState.onStartOver(() => {
			if (gridContainer) gridContainer.scrollTop = 0;
		}),
	);
</script>

<svelte:head>
	<title>ReGrind</title>
</svelte:head>
{#await preferencesHydrated then}
	{#if geohash === null}
		<main class="m-auto flex max-w-full flex-1">
			<LocationChooser />
		</main>
	{:else}
		<main class="screen-nav-host">
			<TopBar search={favoriteSearch} searchHidden={hideSearch} />
			{#if !gridState.loading && !gridState.error}
				<DataRefreshControl
					container={gridContainer}
					updating={gridState.refreshing}
					position="top"
					onrefresh={() => void refreshGrid()}
				/>
			{/if}
			<div
				class="pull-scroller"
				bind:this={gridContainer}
				onscroll={onGridScroll}
			>
				<div
					data-slot="grid-content"
					data-refresh-content
					class={[
						"@container/photo-grid min-h-overscrollable flex flex-col gap-4 pb-nav-clear",
						{ "pt-28": searchable, "pt-17": !searchable },
					]}
				>
					<Grid {geohash} search={favoriteSearch} />
				</div>
			</div>
			<ScrollToTopButton
				container={gridContainer}
				class="bottom-nav-clear"
			/>
		</main>
	{/if}
{/await}
