<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";

	import PagerTrack from "$lib/components/shared/PagerTrack.svelte";
	import { hapticSelection } from "$lib/platform/haptics";
	import {
		getInterestTab,
		interestTabIndex,
		interestTabs,
	} from "./interest-tab";
	import MatchesGrid from "./matches/MatchesGrid.svelte";
	import SentTapsList from "./sent/SentTapsList.svelte";
	import TapsReceivedList from "./taps/TapsReceivedList.svelte";
	import ViewsGrid from "./views/ViewsGrid.svelte";

	let {
		ourProfileId,
		active = true,
		headerHeight,
		position = $bindable(0),
		gliding = $bindable(false),
	}: {
		ourProfileId: number;
		/** False while the tab shell has Interest off-screen: then the route belongs to another tab. */
		active?: boolean;
		headerHeight: number;
		position?: number;
		gliding?: boolean;
	} = $props();

	const routed = $derived(
		interestTabIndex(active ? page.url.pathname : getInterestTab()),
	);

	function swipedTo(target: number) {
		const path = interestTabs[target];
		if (!active || !path) return;
		hapticSelection();
		void goto(path, { replaceState: true, noScroll: true });
	}

	// While Interest is on show its neighbours are kept ready for a drag;
	// off-screen in the tab shell only the routed list is, since each holds a
	// screenful of photos.
	function mounts(pane: number, near: boolean): boolean {
		return pane === routed || (active && near);
	}
</script>

<PagerTrack
	data-slot="interest-pager"
	role="main"
	class="screen-nav-host"
	style="--interest-header: calc({headerHeight}px - var(--safe-area-top))"
	count={interestTabs.length}
	index={routed}
	enabled={active}
	onswipe={swipedTo}
	paneSlots={[
		"interest-pane-views",
		"interest-pane-taps",
		"interest-pane-matches",
		"interest-pane-sent",
	]}
	bind:position
	bind:gliding
>
	{#snippet pane(index, { near })}
		{#if mounts(index, near)}
			{#if index === 0}
				<ViewsGrid {ourProfileId} />
			{:else if index === 1}
				<TapsReceivedList
					{ourProfileId}
					active={active && routed === 1}
				/>
			{:else if index === 2}
				<MatchesGrid active={active && routed === 2} />
			{:else}
				<SentTapsList {ourProfileId} />
			{/if}
		{/if}
	{/snippet}
</PagerTrack>
