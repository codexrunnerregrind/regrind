<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { untrack } from "svelte";
	import { prefersReducedMotion } from "svelte/motion";

	import { STACK_Z } from "$lib/components/navigation/stack/motion";
	import { navTabs } from "$lib/components/shared/nav-tabs";
	import NavBar from "$lib/components/shared/NavBar.svelte";
	import {
		tabShellCovered,
		tabShellRoot,
	} from "$lib/components/tab-shell/tab-shell-state.svelte";
	import { hapticSelection } from "$lib/platform/haptics";
	import { type PanDirection, panPager } from "$lib/util/pan-pager";
	import { remeasureScreenChrome } from "$lib/util/screen-chrome.svelte";
	import BrowseScreen from "../(navbar)/(root)/BrowseScreen.svelte";
	import { getInterestTab } from "../(navbar)/interest/interest-tab";
	import InterestScreen from "../(navbar)/interest/InterestScreen.svelte";
	import RightNowScreen from "../(navbar)/right-now/RightNowScreen.svelte";
	import YouScreen from "../(navbar)/settings/(me)/YouScreen.svelte";
	import InboxScreen from "../chat/InboxScreen.svelte";

	/**
	 * The bottom bar's five tabs side by side on one track, so a swipe drags the
	 * neighbouring tab in under the finger. Phone only, and only on the tabs' own
	 * screens: see `tabShellShowing`.
	 *
	 * The track moves by transform rather than by scrolling: on iOS a native
	 * scroller around Interest's and Inbox's own pagers took their swipes and
	 * never reported its rest, and a scroll offset set by hand repaints both
	 * screens on every frame where a transform is only recomposited. The tab is
	 * picked the moment the finger lifts.
	 */
	let { ourProfileId }: { ourProfileId: number } = $props();

	// Past either end the drag gives this much per pixel, as the profile pager's.
	const RUBBER_BAND = 0.35;
	const SETTLE = "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)";

	const routed = $derived(
		Math.max(
			0,
			navTabs.findIndex((tab) => tab.match(page.route.id ?? "")),
		),
	);
	const covered = $derived(tabShellCovered());

	// The pane the track rests on. It runs ahead of the route on a swipe, so the
	// track never jumps back while the navigation is still under way.
	let index = $state(untrack(() => routed));
	let dragX = $state(0);
	let settling = $state(false);

	// The pane shown and its neighbours are mounted, and no others: five live
	// screens (the grid's images, every Interest list) were enough for iOS to
	// kill the WebView. One left behind is let go once the app is idle again,
	// not mid-slide, and restores its scroll when it comes back.
	let mounted = $state(navTabs.map(() => false));

	$effect(() => {
		const pane = routed;
		untrack(() => {
			if (pane === index) return;
			settling = !prefersReducedMotion.current;
			index = pane;
		});
	});

	$effect(() => {
		mounted[index] = true;
	});

	// In case the slide ends without a transitionend (nothing to animate).
	$effect(() => {
		if (!settling) return;
		const handle = setTimeout(() => (settling = false), 600);
		return () => clearTimeout(handle);
	});

	// Once the track is at rest and the app idle, the neighbours mount, so a
	// drag never has to build the screen it pulls in, and the rest are let go.
	$effect(() => {
		const shown = index;
		if (settling) return;
		const fit = () => {
			for (const [pane, live] of mounted.entries()) {
				const wanted = Math.abs(pane - shown) <= 1;
				if (live !== wanted) mounted[pane] = wanted;
			}
		};
		if ("requestIdleCallback" in window) {
			const handle = requestIdleCallback(fit, { timeout: 1500 });
			return () => cancelIdleCallback(handle);
		}
		const handle = setTimeout(fit, 300);
		return () => clearTimeout(handle);
	});

	// Interest's link goes through a redirect to its last sub-tab; going there
	// directly saves the hop.
	function tabPath(pane: number): string | undefined {
		const tab = navTabs[pane];
		if (!tab) return undefined;
		return tab.href === "/interest" ? getInterestTab() : tab.href;
	}

	function canGo(direction: PanDirection): boolean {
		return !covered && navTabs[index + direction] !== undefined;
	}

	function go(direction: PanDirection) {
		dragX = 0;
		settling = !prefersReducedMotion.current;
		const path = tabPath(index + direction);
		if (covered || !path) return;
		index += direction;
		hapticSelection();
		void goto(path, { noScroll: true });
	}

	function pan(dx: number) {
		settling = false;
		const toward = index + (dx < 0 ? 1 : -1);
		if (navTabs[toward] && !mounted[toward]) mounted[toward] = true;
		dragX = canGo(dx < 0 ? 1 : -1) ? dx : dx * RUBBER_BAND;
	}

	function springBack() {
		dragX = 0;
		settling = !prefersReducedMotion.current;
	}
</script>

<!-- The conversation stack slides over this box, and marks it covered. -->
<div
	{@attach (node) => {
		tabShellRoot.set(node);
		return () => tabShellRoot.set(null);
	}}
	data-slot="tab-shell"
	data-tab-shell-moving={settling || dragX !== 0 ? "" : undefined}
	class="fixed inset-x-0 top-0 h-(--viewport-height) bg-background"
	style:z-index={STACK_Z.back}
>
	<!-- Inner pagers (Interest, Inbox) keep their own swipes; one past their
	     ends drags the neighbouring tab in here, as any other swipe does. -->
	<div
		data-slot="tab-shell-pager"
		class="relative h-full overflow-hidden"
		use:panPager={{
			enabled: !covered,
			canGo,
			onpan: pan,
			oncommit: go,
			oncancel: springBack,
		}}
	>
		<div
			data-slot="tab-shell-track"
			class="absolute inset-0"
			style:transform="translate3d(calc({-index * 100}% + {dragX}px), 0,
			0)"
			style:transition={settling ? SETTLE : "none"}
			style:will-change={settling || dragX !== 0 ? "transform" : "auto"}
			ontransitionend={(event) => {
				// Only the track's own settle: the screens have transitions too.
				if (event.target !== event.currentTarget) return;
				settling = false;
				remeasureScreenChrome();
			}}
		>
			{#each navTabs as tab, pane (tab.href)}
				<div
					data-tab-pane={tab.label}
					data-active={pane === routed && !covered ? "" : undefined}
					inert={pane !== index}
					aria-hidden={pane !== index ? "true" : undefined}
					class="absolute inset-y-0 w-full overflow-hidden [contain:paint]"
					style:left="{pane * 100}%"
				>
					{#if mounted[pane]}
						{@const active = pane === routed && !covered}
						{#if pane === 0}
							<div
								class="flex min-h-dvh flex-col pt-(--safe-area-top) pb-(--content-pb)"
							>
								<BrowseScreen {active} />
							</div>
						{:else if pane === 1}
							<div
								class="flex min-h-dvh flex-col pt-(--safe-area-top) pb-(--content-pb)"
							>
								<RightNowScreen {ourProfileId} />
							</div>
						{:else if pane === 2}
							<div
								class="flex min-h-dvh flex-col pt-(--safe-area-top) pb-(--content-pb)"
							>
								<InterestScreen {ourProfileId} {active} />
							</div>
						{:else if pane === 3}
							<div
								class="flex h-full flex-col pt-(--safe-area-top) pb-(--safe-area-bottom)"
							>
								<InboxScreen {ourProfileId} {active} />
							</div>
						{:else}
							<div
								class="flex min-h-dvh flex-col pt-(--safe-area-top) pb-(--content-pb)"
							>
								<YouScreen {ourProfileId} />
							</div>
						{/if}
					{/if}
				</div>
			{/each}
		</div>
	</div>
	<NavBar {ourProfileId} />
</div>
