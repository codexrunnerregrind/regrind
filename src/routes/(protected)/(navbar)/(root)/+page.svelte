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
		await gridState.reload();
	}

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
			<div
				class="pull-scroller"
				bind:this={gridContainer}
				onscroll={() => (gridState.scrollY = gridContainer?.scrollTop ?? 0)}
			>
				<div
					class="@container/photo-grid flex min-h-overscrollable flex-col gap-4 pt-4 pb-nav-clear"
				>
					<TopBar />
					<Grid {geohash} />
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
