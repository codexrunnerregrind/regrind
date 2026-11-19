<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";

	import PagerTrack from "#lib/components/shared/PagerTrack.svelte";
	import { hapticSelection } from "#lib/platform/haptics.ts";
	import {
		getInterestTab,
		type InterestTab,
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
		tabs = interestTabs,
	}: {
		ourProfileId: number;
		/** False while the tab shell has Interest off-screen: then the route belongs to another tab. */
		active?: boolean;
		headerHeight: number;
		position?: number;
		gliding?: boolean;
		tabs?: readonly InterestTab[];
	} = $props();

	const routed = $derived(
		interestTabIndex(active ? page.url.pathname : getInterestTab(), tabs),
	);

	function swipedTo(target: number) {
		const path = tabs[target];
		if (!active || !path) return;
		hapticSelection();
		void goto(path, { replace: true, reset: false });
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
	count={tabs.length}
	index={routed}
	enabled={active}
	onswipe={swipedTo}
	paneSlots={tabs.map(
		(tab) => `interest-pane-${tab.slice("/interest/".length)}`,
	)}
	bind:position
	bind:gliding
>
	{#snippet pane(index, { near })}
		{#if mounts(index, near)}
			{@const tab = tabs[index]}
			{#if tab === "/interest/views"}
				<ViewsGrid {ourProfileId} />
			{:else if tab === "/interest/taps"}
				<TapsReceivedList
					{ourProfileId}
					active={active && routed === index}
				/>
			{:else if tab === "/interest/matches"}
				<MatchesGrid active={active && routed === index} />
			{:else}
				<SentTapsList {ourProfileId} />
			{/if}
		{/if}
	{/snippet}
</PagerTrack>
