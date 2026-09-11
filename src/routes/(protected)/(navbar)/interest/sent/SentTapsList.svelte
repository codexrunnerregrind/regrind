<script lang="ts">
	import { untrack } from "svelte";

	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import ListRowSkeleton from "$lib/components/feedback/ListRowSkeleton.svelte";
	import ScrollToTopButton from "$lib/components/shared/ScrollToTopButton.svelte";
	import { getSentTapsState } from "$lib/interest/sent-taps-state.svelte";
	import { armProfileDeck } from "$lib/profile/profile-deck";
	import { observeIntersection } from "$lib/util/observe-intersection";
	import { restoreScrollOnce } from "$lib/util/scroll-restore.svelte";
	import EmptySentTapsList from "./EmptySentTapsList.svelte";
	import TapSentProfile from "./TapSentProfile.svelte";

	let { ourProfileId }: { ourProfileId: number } = $props();

	const taps = untrack(() => {
		const state = getSentTapsState(ourProfileId);
		state.load();
		return state;
	});

	let container: HTMLDivElement | null = $state(null);

	restoreScrollOnce(() => container, taps);

	// Same as the received list: the profile screen swipes through the rest of
	// what is on screen here.
	function armSentTaps(profileId: number) {
		armProfileDeck(profileId, {
			ids: taps.taps.map((tap) => tap.profileId),
			extend: () => {
				taps.loadMore();
				return Promise.resolve(taps.taps.map((tap) => tap.profileId));
			},
		});
	}
</script>

<div class="screen-nav-host">
	<div
		bind:this={container}
		class="pull-scroller"
		onscroll={() => (taps.scrollY = container?.scrollTop ?? 0)}
	>
		<div
			class="mx-auto flex min-h-overscrollable w-full max-w-120 flex-col gap-0 px-0 pt-(--interest-header) pb-nav-clear"
		>
			{#if taps.loading}
				{#each Array(8)}
					<ListRowSkeleton />
				{/each}
			{:else if taps.error}
				<div class="flex flex-1">
					<ApiErrorDisplay
						error={taps.error}
						onRetry={() => taps.retry()}
						class="m-auto"
					/>
				</div>
			{:else}
				{#each taps.taps as tap (tap.profileId)}
					<TapSentProfile
						{tap}
						onclick={() => armSentTaps(tap.profileId)}
					/>
				{:else}
					<EmptySentTapsList />
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
	{#if !taps.loading && !taps.error}
		<DataRefreshControl
			{container}
			updating={taps.refreshing}
			position="top"
			onrefresh={() => void taps.refresh()}
		/>
	{/if}
	<ScrollToTopButton {container} class="bottom-nav-clear" />
</div>
