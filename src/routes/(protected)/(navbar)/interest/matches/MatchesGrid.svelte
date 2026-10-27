<script lang="ts">
	import { onMount } from "svelte";

	import { getMatchesCardStyleSnapshot } from "$lib/app-data/preferences.svelte";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import ScrollToTopButton from "$lib/components/shared/ScrollToTopButton.svelte";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { getSentTapsState } from "$lib/interest/sent-taps-state.svelte";
	import { observeIntersection } from "$lib/util/observe-intersection";
	import { restoreScrollOnce } from "$lib/util/scroll-restore.svelte";
	import EmptyMatchesGrid from "./EmptyMatchesGrid.svelte";
	import MatchCard from "./MatchCard.svelte";
	import { matchesState } from "./matches-state.svelte";

	// Held by the Interest layout. Sending a tap raises no event, so a tap sent
	// from a profile only shows here once the list is fetched again.
	const sentTaps = getSentTapsState.peek();
	onMount(() => {
		void sentTaps?.refresh();
	});

	const remainingProfilesToLoad = $derived(
		Math.max(0, matchesState.serverTotal - matchesState.matches.length),
	);

	const style = $derived(getMatchesCardStyleSnapshot());
	const columns = $derived(style === "full" ? 2 : 3);
	const skeletonAspect = $derived(
		style === "full" ? "aspect-3/4" : "aspect-square",
	);

	let container: HTMLDivElement | null = $state(null);

	restoreScrollOnce({ container: () => container, state: matchesState });
</script>

<main class="screen-nav-host">
	{#if !matchesState.loading && (matchesState.matches.length > 0 || !matchesState.error)}
		<DataRefreshControl
			{container}
			updating={matchesState.refreshing}
			position="top"
			onrefresh={() => void matchesState.refresh()}
		/>
	{/if}
	<div
		bind:this={container}
		data-slot="matches-scroller"
		class="pull-scroller"
		onscroll={() => (matchesState.scrollY = container?.scrollTop ?? 0)}
	>
		<div
			data-refresh-content
			class="@container/photo-grid min-h-overscrollable flex w-full flex-col gap-3 pt-(--interest-header) pb-nav-clear"
		>
			{#if matchesState.loading && !matchesState.matches.length}
				<div class="photo-grid" data-grid-columns={columns}>
					{#each Array(24)}
						<Skeleton class={[skeletonAspect, "rounded-none"]} />
					{/each}
				</div>
			{:else if matchesState.error && matchesState.matches.length === 0}
				<div class="flex flex-1">
					<ApiErrorDisplay
						error={matchesState.error}
						onRetry={() => matchesState.refresh()}
						class="m-auto"
					/>
				</div>
			{:else if !matchesState.loading && matchesState.matches.length === 0}
				<EmptyMatchesGrid />
			{:else}
				<div class="photo-grid" data-grid-columns={columns}>
					{#each matchesState.matches as match (match.matchId)}
						<MatchCard
							{match}
							{style}
							sentTap={sentTaps?.sentTo(match.profile.profileId)}
						/>
					{/each}

					{#if matchesState.loading}
						{#each Array(Math.min(24, remainingProfilesToLoad))}
							<Skeleton
								class={[skeletonAspect, "rounded-none"]}
							/>
						{/each}
					{/if}
				</div>
				{#if matchesState.hasMore}
					<div
						class="h-0"
						use:observeIntersection={{
							handle: () => matchesState.loadMore(),
							rootMargin: "400px",
						}}
					></div>
				{/if}
			{/if}
		</div>
	</div>
	<ScrollToTopButton {container} class="bottom-nav-clear" />
</main>
