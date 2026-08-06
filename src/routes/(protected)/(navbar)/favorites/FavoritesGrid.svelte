<script lang="ts">
	import { favoriteNote } from "$lib/api/users/favorite-notes-state.svelte";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import { nearestScrollableAncestor } from "$lib/components/feedback/refresh/scroll-chain";
	import ProfileMiniCard from "$lib/components/profile/ProfileMiniCard.svelte";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import NoNoteMatches from "../(root)/NoNoteMatches.svelte";
	import EmptyFavorites from "./EmptyFavorites.svelte";
	import type { FavoritesState } from "./favorites-state.svelte";

	let { favorites }: { favorites: FavoritesState } = $props();

	let container: HTMLDivElement | null = $state(null);

	function observeSentinel(node: HTMLElement) {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) favorites.loadMore();
			},
			{ root: nearestScrollableAncestor(node), rootMargin: "400px" },
		);
		observer.observe(node);
		return {
			destroy() {
				observer.disconnect();
			},
		};
	}
</script>

<div class="screen-nav-host">
	<div bind:this={container} class="pull-scroller">
		<div
			class="@container/photo-grid flex min-h-overscrollable w-full flex-col gap-3 pt-16 pb-nav-clear"
		>
			{#if favorites.loading}
				<div class="photo-grid">
					{#each Array(24)}
						<Skeleton class="aspect-square rounded-none" />
					{/each}
				</div>
			{:else if favorites.error}
				<div class="flex flex-1">
					<ApiErrorDisplay
						error={favorites.error}
						onRetry={() => favorites.retry()}
						class="m-auto"
					/>
				</div>
			{:else if favorites.favorites.length === 0}
				{#if favorites.filtered}
					<NoNoteMatches query={favorites.query} />
				{:else}
					<EmptyFavorites />
				{/if}
			{:else}
				<div class="photo-grid">
					{#each favorites.favorites as entry (entry.profileId)}
						{#if entry.type === "profile"}
							<ProfileMiniCard
								mediaHash={entry.profileImageMediaHash}
								displayName={entry.displayName}
								age={entry.age}
								distance={entry.distance}
								onlineUntil={entry.onlineUntil}
								isFavorite={entry.isFavorite}
								rightNow={entry.rightNow}
								note={favoriteNote(entry.profileId)?.notes ?? null}
								href="/profile/{entry.profileId}"
							/>
						{:else}
							<ProfileMiniCard
								mediaHash={null}
								displayName="Unavailable"
								isFavorite={true}
								class="opacity-50"
							/>
						{/if}
					{/each}
				</div>
				{#if favorites.hasMore}
					<div class="h-0" use:observeSentinel></div>
				{/if}
			{/if}
		</div>
	</div>
	{#if !favorites.loading && !favorites.error}
		<DataRefreshControl
			{container}
			updating={favorites.refreshing}
			position="top"
			onrefresh={() => void favorites.refresh()}
		/>
	{/if}
</div>
