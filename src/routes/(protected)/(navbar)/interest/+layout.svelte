<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";

	import UnderlineTabs from "$lib/components/shared/UnderlineTabs.svelte";
	import { getViewActivityState } from "$lib/interest/view-activity.svelte";
	import { hapticSelection } from "$lib/platform/haptics";
	import { swipeTabs } from "$lib/util/swipe-tabs";
	import { interestTabs, rememberInterestTab } from "./interest-tab";

	let { children }: { children?: import("svelte").Snippet } = $props();

	// The header is fixed, so the pages under it have to reserve its height
	// themselves. Measured rather than hard-coded: the title and tabs change size
	// with the user's text settings, and a stale constant would either clip the
	// first row or leave a gap. Seeded with the resting height so the first paint
	// is already right. The safe-area inset comes back off below — this height
	// includes it, but the pages already sit inside it.
	let headerHeight = $state(91);

	const tabs = [
		{ value: interestTabs[0], label: "Views" },
		{ value: interestTabs[1], label: "Taps" },
	];

	// So the tab bar's /interest link comes back here rather than resetting.
	$effect(() => {
		rememberInterestTab(page.url.pathname);
	});

	// Opening Interest is what clears the nav-bar badge. Reading the flag (rather
	// than clearing once on mount) also covers a view that arrives while this
	// screen is already open — it never gets a chance to badge. `peek` because
	// the nav bar owns the instance; there is nothing to clear without it.
	$effect(() => {
		const activity = getViewActivityState.peek();
		if (activity?.hasUnseenViews) activity.markSeen();
	});

	const activeIndex = $derived(
		Math.max(
			0,
			tabs.findIndex((tab) => tab.value === page.url.pathname),
		),
	);

	function select(value: string) {
		if (value === page.url.pathname) return;
		hapticSelection();
		void goto(value);
	}

	function selectIndex(index: number) {
		const tab = tabs[index];
		if (tab) select(tab.value);
	}
</script>

<!-- Opaque, not a blur gradient: the grid scrolls underneath, and a fading
     background let the tiles read straight through the title and tabs. -->
<nav
	bind:clientHeight={headerHeight}
	data-fixed-header
	class="fixed top-0 left-0 z-10 w-full bg-background px-screen pt-fixed-header"
>
	<h1 class="screen-title">Interest</h1>
	<UnderlineTabs
		{tabs}
		value={tabs[activeIndex]?.value ?? ""}
		onSelect={select}
		class="mt-4"
	/>
</nav>
<!-- Custom properties inherit through display:contents, so the pages below read
     the measured height without an extra box in the layout. -->
<div
	class="contents"
	style:--interest-header="calc({headerHeight}px - var(--safe-area-top))"
	use:swipeTabs={{
		onNext: () => selectIndex(activeIndex + 1),
		onPrev: () => selectIndex(activeIndex - 1),
	}}
>
	{@render children?.()}
</div>
