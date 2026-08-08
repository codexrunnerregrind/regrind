<script lang="ts">
	import { untrack } from "svelte";

	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import ListRowSkeleton from "$lib/components/feedback/ListRowSkeleton.svelte";
	import { nearestScrollableAncestor } from "$lib/components/feedback/refresh/scroll-chain";
	import { armProfileDeck } from "$lib/profile/profile-deck";
	import { restoreScrollOnce } from "$lib/util/scroll-restore.svelte";
	import EmptyTapsList from "./EmptyTapsList.svelte";
	import TapReceivedProfile from "./TapReceivedProfile.svelte";
	import { getTapsState } from "./taps-state.svelte";

	let { ourProfileId }: { ourProfileId: number } = $props();

	const taps = untrack(() => {
		const state = getTapsState(ourProfileId);
		state.load();
		return state;
	});

	let container: HTMLDivElement | null = $state(null);

	restoreScrollOnce(() => container, taps);

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

	function observeSentinel(node: HTMLElement) {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) taps.loadMore();
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
					<TapReceivedProfile
						{tap}
						onclick={() => armTaps(tap.profileId)}
					/>
				{:else}
					<EmptyTapsList />
				{/each}
				{#if taps.hasMore}
					<div class="h-0" use:observeSentinel></div>
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
</div>
