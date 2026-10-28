<script lang="ts">
	import { afterNavigate, goto } from "$app/navigation";
	import { navigating, page } from "$app/state";
	import { untrack } from "svelte";

	import { navigationPending } from "$lib/util/history";
	import { SnapPager } from "$lib/util/snap-pager";
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
		onUnsettle,
		onSettle,
		onPager,
	}: {
		ourProfileId: number;
		/** False while the tab shell has Interest off-screen: then the route belongs to another tab. */
		active?: boolean;
		headerHeight: number;
		onUnsettle: () => void;
		onSettle: (tab: number) => void;
		onPager?: (node: HTMLElement | null) => void;
	} = $props();

	const TABS: readonly string[] = interestTabs;

	// A pane mounts the first time any of it scrolls into view and stays
	// mounted while Interest is on show; off-screen in the tab shell only the
	// routed one is kept, since each list holds a screenful of photos.
	let mounted = $state(interestTabs.map(() => false));
	let paging = false;
	let heading: number | null = null;
	let restedPane: number | null = null;

	const routed = $derived(
		interestTabIndex(active ? page.url.pathname : getInterestTab()),
	);

	const snap = new SnapPager({
		count: () => TABS.length,
		onVisible: ({ first, last }) => {
			for (let pane = first; pane <= last; pane += 1)
				mounted[pane] = true;
			paging = first !== last;
			if (paging) onUnsettle();
		},
		onHeading: (pane) => {
			heading = pane;
		},
		onRest: (pane) => {
			onSettle(pane);
			if (!active) return;
			const landed = TABS[pane];
			const pending = navigating.to?.url.pathname;
			const ownReplacePending =
				restedPane !== null && pending === TABS[restedPane];
			if (pane !== restedPane) restedPane = null;
			if (
				!landed ||
				landed === pending ||
				(landed === page.url.pathname && !ownReplacePending) ||
				navigationPending({
					owns: (pathname) => TABS.includes(pathname),
				})
			)
				return;
			restedPane = pane;
			void goto(landed, { replaceState: true, noScroll: true });
		},
	});

	$effect(() => {
		mounted[routed] = true;
	});

	$effect(() => {
		const pane = routed;
		const restedHere = pane === restedPane;
		restedPane = null;
		if (!restedHere) untrack(() => snap.place(pane, { animated: true }));
	});

	afterNavigate(() => {
		const ownReplaceDropped = restedPane !== null && restedPane !== routed;
		if (!ownReplaceDropped) return;
		restedPane = null;
		snap.place(routed, { animated: true });
	});

	function swallowClickOutsideHeadingPane(
		event: MouseEvent & { currentTarget: HTMLElement },
	) {
		if (!paging || heading === null) return;
		const headingPane = event.currentTarget.children[heading];
		if (event.target instanceof Node && headingPane?.contains(event.target))
			return;
		event.preventDefault();
		event.stopPropagation();
	}
</script>

<main
	data-slot="interest-pager"
	data-scroll-intent="x"
	data-swipe-tabs-chain
	ontouchstart={onUnsettle}
	onclickcapture={swallowClickOutsideHeadingPane}
	style:--interest-header="calc({headerHeight}px - var(--safe-area-top))"
	class="screen-nav-host no-scrollbar flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-none"
	{@attach snap.attach}
	{@attach (node) => {
		onPager?.(node);
		return () => onPager?.(null);
	}}
>
	<div data-slot="interest-pane-views" class="w-full shrink-0 snap-start">
		{#if mounted[0] && (active || routed === 0)}
			<ViewsGrid {ourProfileId} />
		{/if}
	</div>
	<div data-slot="interest-pane-taps" class="w-full shrink-0 snap-start">
		{#if mounted[1] && (active || routed === 1)}
			<TapsReceivedList {ourProfileId} active={active && routed === 1} />
		{/if}
	</div>
	<div data-slot="interest-pane-matches" class="w-full shrink-0 snap-start">
		{#if mounted[2] && (active || routed === 2)}
			<MatchesGrid active={active && routed === 2} />
		{/if}
	</div>
	<div data-slot="interest-pane-sent" class="w-full shrink-0 snap-start">
		{#if mounted[3] && (active || routed === 3)}
			<SentTapsList {ourProfileId} />
		{/if}
	</div>
</main>
