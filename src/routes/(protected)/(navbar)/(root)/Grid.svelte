<script lang="ts">
	import {
		ensureFavoriteNotes,
		favoriteNote,
	} from "$lib/api/users/favorite-notes-state.svelte";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import { armProfileDeck } from "$lib/profile/profile-deck";
	import { observeIntersection } from "$lib/util/observe-intersection";
	import type { FavoriteSearch } from "$lib/favorites/favorite-search.svelte";
	import type { GridProfile } from "$lib/grid/grid";
	import EmptyGrid from "./EmptyGrid.svelte";
	import GridProfileMiniCard from "./GridProfileMiniCard.svelte";
	import NoNoteMatches from "./NoNoteMatches.svelte";

	let { geohash, search }: { geohash: string; search: FavoriteSearch } =
		$props();

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

	$effect.pre(() => {
		gridState.load(geohash);
	});
</script>

<div class="photo-grid relative">
	{#if search.active}
		<!-- Search replaces the cascade: matches come from every favorite, not
		     only the ones this paged grid happens to have loaded. -->
		{#if search.loading && search.results.length === 0}
			{#each Array.from({ length: 6 })}
				<div class="aspect-square animate-pulse bg-stone-700"></div>
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
		{#each Array.from({ length: 20 })}
			<div class="aspect-square animate-pulse bg-stone-700"></div>
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
		{#each gridProfiles as item (item.id)}
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
				<div
					class="aspect-square animate-pulse bg-stone-700"
					use:observeIntersection={{
						handle: () => {
							gridState
								.resolveProfile(item.id)
								.catch((error) => console.error(error));
						},
						root: "scroller",
						rootMargin: "200px",
					}}
				></div>
			{/if}
		{:else}
			<EmptyGrid />
		{/each}
		{#if gridState.loadingMore}
			{#each Array.from({ length: 20 })}
				<div class="aspect-square animate-pulse bg-stone-700"></div>
			{/each}
		{/if}
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
