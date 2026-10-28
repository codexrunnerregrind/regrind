<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { onDestroy } from "svelte";

	import UnderlineTabs from "$lib/components/shared/UnderlineTabs.svelte";
	import { getSentTapsState } from "$lib/interest/sent-taps-state.svelte";
	import { getTapsState } from "$lib/interest/taps-state.svelte";
	import { getViewActivityState } from "$lib/interest/view-activity.svelte";
	import { hapticSelection } from "$lib/platform/haptics";
	import {
		getInterestTab,
		interestTabIndex,
		interestTabs,
		rememberInterestTab,
	} from "./interest-tab";
	import InterestPager from "./InterestPager.svelte";
	import { matchesState } from "./matches/matches-state.svelte";
	import { getViewsState } from "./views/views-state.svelte";

	// Off-screen in the tab shell it stays mounted; only while `active` does the
	// route say which sub-tab is showing, and does showing count as seeing.
	let { ourProfileId, active }: { ourProfileId: number; active: boolean } =
		$props();

	// Every list is held here rather than by its page, so every tab can
	// carry its count before you have been there. It costs one load per list on
	// entering Interest, which is also what makes a tab switch instant — the
	// states are account-scoped, so the pages find them already filled in.
	const views = $derived(getViewsState(ourProfileId));
	const taps = $derived(getTapsState(ourProfileId));
	const sentTaps = $derived(getSentTapsState(ourProfileId));

	// The header is fixed, so the pages under it have to reserve its height
	// themselves. Measured rather than hard-coded: the title and tabs change size
	// with the user's text settings, and a stale constant would either clip the
	// first row or leave a gap. Seeded with the resting height so the first paint
	// is already right. The safe-area inset comes back off below — this height
	// includes it, but the pages already sit inside it.
	let headerHeight = $state(91);

	$effect(() => {
		matchesState.load();
	});

	// No count while a list is still loading: a 0 that turns into 34 reads as an
	// empty tab for as long as the request takes.
	const tabs = $derived([
		{
			value: interestTabs[0],
			label: "Views",
			count: views.loading ? null : views.total,
		},
		{
			value: interestTabs[1],
			label: "Taps",
			count: taps.loading ? null : taps.total,
		},
		{
			value: interestTabs[2],
			label: "Matches",
			count: matchesState.loaded ? matchesState.serverTotal : null,
		},
		{
			value: interestTabs[3],
			label: "Sent",
			count: sentTaps.loading ? null : sentTaps.total,
		},
	]);

	// So the tab bar's /interest link comes back here rather than resetting.
	$effect(() => {
		if (active) rememberInterestTab(page.url.pathname);
	});

	// Opening Interest is what clears the nav-bar badge. Reading the flag (rather
	// than clearing once on mount) also covers a view that arrives while this
	// screen is already open — it never gets a chance to badge. `peek` because
	// the nav bar owns the instance; there is nothing to clear without it.
	$effect(() => {
		if (!active) return;
		const activity = getViewActivityState.peek();
		if (activity?.hasUnseenViews) activity.markSeen();
	});

	const activeIndex = $derived(
		interestTabIndex(active ? page.url.pathname : getInterestTab()),
	);

	function select(value: string) {
		if (value === page.url.pathname) return;
		hapticSelection();
		void goto(value, { replaceState: true, noScroll: true });
	}

	// The underline tracks the pager only while it moves, and until the route
	// catches up with where it came to rest.
	let pager: HTMLElement | null = $state(null);
	let pagerUnsettled = $state(false);
	let restingTab = $state<number>();
	let settling = 0;

	const underlineFollows = $derived(
		pagerUnsettled ||
			(restingTab !== undefined && restingTab !== activeIndex),
	);

	function unsettle() {
		cancelAnimationFrame(settling);
		pagerUnsettled = true;
	}

	function settle(tab: number) {
		restingTab = tab;
		cancelAnimationFrame(settling);
		settling = requestAnimationFrame(() => {
			settling = requestAnimationFrame(() => {
				pagerUnsettled = false;
			});
		});
	}

	onDestroy(() => cancelAnimationFrame(settling));
</script>

<!-- Opaque, not a blur gradient: the grid scrolls underneath, and a fading
     background let the tiles read straight through the title and tabs. -->
<nav
	bind:clientHeight={headerHeight}
	aria-label="Interest"
	data-fixed-header
	class="fixed top-0 left-0 z-10 w-full bg-background px-screen pt-fixed-header"
>
	<h1 class="screen-title">Interest</h1>
	<UnderlineTabs
		{tabs}
		value={tabs[activeIndex]?.value ?? ""}
		onSelect={select}
		scroller={pager}
		following={underlineFollows}
		class="mt-4"
	/>
</nav>
<InterestPager
	{ourProfileId}
	{active}
	{headerHeight}
	onUnsettle={unsettle}
	onSettle={settle}
	onPager={(node) => (pager = node)}
/>
