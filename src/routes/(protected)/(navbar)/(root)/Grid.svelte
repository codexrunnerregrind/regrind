<script lang="ts">
	import {
		ensureFavoriteNotes,
		favoriteNote,
	} from "$lib/api/users/favorite-notes-state.svelte";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import { armProfileDeck } from "$lib/profile/profile-deck";
	import { observeIntersection } from "$lib/util/observe-intersection";
	import { virtualGrid } from "$lib/util/virtual-grid.svelte";
	import type { FavoriteSearch } from "$lib/favorites/favorite-search.svelte";
	import type { GridProfile } from "$lib/grid/grid";
	import EmptyGrid from "./EmptyGrid.svelte";
	import GridCellSkeleton from "./GridCellSkeleton.svelte";
	import GridProfileMiniCard from "./GridProfileMiniCard.svelte";
	import NoNoteMatches from "./NoNoteMatches.svelte";

	const PAGE_SKELETONS = 20;

	let { geohash, search }: { geohash: string; search: FavoriteSearch } =
		$props();

	let gridElement: HTMLElement | null = $state(null);

	function dedupe(items: readonly GridProfile[]): GridProfile[] {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local to this call, never mutated afterwards
		const byId = new Map<number, GridProfile>();
		for (const item of items) {
			const existing = byId.get(item.id);
			if (
				!existing ||
				(existing.type === "lazy" && item.type === "rendered")
			) {
				byId.set(item.id, item);
			}
		}
		return [...byId.values()];
	}

	const gridProfiles = $derived(dedupe(gridState.items));

	// Opening a profile hands it the rest of the cascade, so the profile screen
	// can swipe between them in the order they are shown here. Armed per tap
	// rather than kept as ambient state — see `armProfileDeck`.
	function armCascade(profileId: number) {
		armProfileDeck(profileId, {
			ids: gridProfiles.map((item) => item.id),
			extend: async () => {
				await gridState.loadMore();
				return dedupe(gridState.items).map((item) => item.id);
			},
		});
	}

	function armSearchResults(profileId: number) {
		armProfileDeck(profileId, {
			ids: search.results.map((result) => result.profileId),
		});
	}

	// Notes belong to favorites, and any of the profiles here can be one, so the
	// notes are read once for the whole grid rather than per card.
	$effect(() => {
		void ensureFavoriteNotes();
	});

	const pendingSkeletons = $derived(
		gridState.loadingMore ? PAGE_SKELETONS : 0,
	);
	const view = virtualGrid({
		grid: () => gridElement,
		count: () => gridProfiles.length + pendingSkeletons,
	});
	const visibleProfiles = $derived(
		gridProfiles.slice(view.startIndex, view.endIndex),
	);
	const visibleSkeletons = $derived(
		Math.max(
			0,
			view.endIndex - Math.max(view.startIndex, gridProfiles.length),
		),
	);

	$effect.pre(() => {
		gridState.load(geohash);
	});
</script>

<!-- Only the cascade is virtualized: search shows a short, fully-rendered list
     of matches, so the windowing offsets would only push it off-screen. -->
<div
	bind:this={gridElement}
	class="photo-grid relative"
	style:padding-top={search.active ? undefined : `${view.paddingTopPx}px`}
	style:padding-bottom={search.active
		? undefined
		: `${view.paddingBottomPx}px`}
	data-rows-above={(!search.active && view.hasRowsAbove) || undefined}
	data-rows-below={(!search.active && view.hasRowsBelow) || undefined}
>
	{#if search.active}
		<!-- Search replaces the cascade: matches come from every favorite, not
		     only the ones this paged grid happens to have loaded. -->
		{#if search.loading && search.results.length === 0}
			{#each Array.from({ length: 6 })}
				<GridCellSkeleton />
			{/each}
		{:else if search.error}
			<div class="col-span-full flex p-4">
				<ApiErrorDisplay
					error={search.error}
					onRetry={() => search.search(search.query)}
					class="m-auto"
				/>
			</div>
		{:else}
			{#each search.results as result (result.profileId)}
				<GridProfileMiniCard
					id={result.profileId}
					displayName={result.displayName}
					distance={result.distance}
					onlineUntil={result.onlineUntil}
					isFavorite={true}
					rightNow={result.rightNow}
					note={result.note}
					onclick={() => armSearchResults(result.profileId)}
					medias={result.profileImageMediaHash === null
						? []
						: [{ mediaHash: result.profileImageMediaHash }]}
				/>
			{:else}
				<div class="col-span-full">
					<NoNoteMatches query={search.query} />
				</div>
			{/each}
		{/if}
	{:else if gridState.loading}
		{#each Array.from({ length: PAGE_SKELETONS })}
			<GridCellSkeleton />
		{/each}
	{:else if gridState.error}
		<div class="col-span-full flex p-4">
			<ApiErrorDisplay
				error={gridState.error}
				onRetry={() => gridState.retry()}
				class="m-auto"
			/>
		</div>
	{:else}
		{#if gridProfiles.length === 0}
			<EmptyGrid />
		{/if}
		{#each visibleProfiles as item (item.id)}
			{#if item.type === "rendered"}
				<GridProfileMiniCard
					id={item.id}
					displayName={item.displayName}
					distance={item.distance}
					unread={item.unread}
					onlineUntil={item.onlineUntil}
					isFavorite={item.isFavorite}
					isVisiting={item.isVisiting}
					hadRecentChat={item.hasChattedInLast24Hrs}
					medias={item.profilePhotosHashes?.map((mediaHash) => ({
						mediaHash,
					})) ?? []}
					rightNow={item.rightNow}
					note={favoriteNote(item.id)?.notes ?? null}
					onclick={() => armCascade(item.id)}
				/>
			{:else}
				<GridCellSkeleton
					onVisible={() => {
						gridState
							.resolveProfile(item.id)
							.catch((error) => console.error(error));
					}}
				/>
			{/if}
		{/each}
		{#each Array.from({ length: visibleSkeletons })}
			<GridCellSkeleton />
		{/each}
		{#if gridState.nextPage !== 0 && gridState.nextPage !== null}
			<div
				class="pointer-events-none absolute inset-x-0 bottom-0 h-px"
				use:observeIntersection={{
					handle: () => {
						gridState
							.loadMore()
							.catch((error) => console.error(error));
					},
					root: "scroller",
					rootMargin: "400px",
				}}
			></div>
		{/if}
	{/if}
</div>
