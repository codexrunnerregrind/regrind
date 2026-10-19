<script lang="ts">
	import { untrack } from "svelte";

	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import ListRowSkeleton from "$lib/components/feedback/ListRowSkeleton.svelte";
	import ScrollToTopButton from "$lib/components/shared/ScrollToTopButton.svelte";
	import { getTapsState } from "$lib/interest/taps-state.svelte";
	import { armProfileDeck } from "$lib/profile/profile-deck";
	import { observeIntersection } from "$lib/util/observe-intersection";
	import { restoreScrollOnce } from "$lib/util/scroll-restore.svelte";
	import EmptyTapsList from "./EmptyTapsList.svelte";
	import TapReceivedProfile from "./TapReceivedProfile.svelte";

	let { ourProfileId }: { ourProfileId: number } = $props();

	const taps = untrack(() => getTapsState(ourProfileId));

	$effect(() => taps.attachView());

	$effect(() => {
		if (taps.hasUnseen) taps.markViewed();
	});

	let container: HTMLDivElement | null = $state(null);

	restoreScrollOnce({ container: () => container, state: taps });

	// Opening a tap hands the profile screen the rest of the list, so it can
	// swipe between them in the order shown here. Armed per tap rather than kept
	// as ambient state — see `armProfileDeck`.
	function armTaps(profileId: number) {
		armProfileDeck(profileId, {
			ids: taps.taps.map((tap) => tap.profileId),
			// Paging here only reveals more of an already-loaded list, so this
			// resolves immediately rather than waiting on the network.
			extend: () => {
				taps.loadMore();
				return Promise.resolve(taps.taps.map((tap) => tap.profileId));
			},
		});
	}
</script>

<main class="screen-nav-host">
	{#if !taps.loading && (taps.taps.length > 0 || !taps.error)}
		<DataRefreshControl
			{container}
			updating={taps.refreshing}
			position="top"
			onrefresh={() => void taps.refresh()}
		/>
	{/if}
	<div
		bind:this={container}
		data-slot="taps-scroller"
		class="pull-scroller"
		onscroll={() => (taps.scrollY = container?.scrollTop ?? 0)}
	>
		<div
			data-refresh-content
			class="mx-auto min-h-overscrollable flex w-full max-w-120 flex-col gap-0 px-0 pt-(--interest-header) pb-nav-clear"
		>
			{#if taps.loading}
				{#each Array(8)}
					<ListRowSkeleton />
				{/each}
			{:else if taps.error && taps.taps.length === 0}
				<div class="flex flex-1">
					<ApiErrorDisplay
						error={taps.error}
						onRetry={() => taps.retry()}
						class="m-auto"
					/>
				</div>
			{:else}
				{#each taps.taps as tap (tap.profileId)}
					<TapReceivedProfile
						{tap}
						onclick={() => armTaps(tap.profileId)}
					/>
				{:else}
					<EmptyTapsList />
				{/each}
				{#if taps.hasMore}
					<div
						class="h-0"
						use:observeIntersection={{
							handle: () => taps.loadMore(),
							rootMargin: "400px",
						}}
					></div>
				{/if}
			{/if}
		</div>
	</div>
	<ScrollToTopButton {container} class="bottom-nav-clear" />
</main>
