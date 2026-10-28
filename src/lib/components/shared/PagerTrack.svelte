<script lang="ts" module>
	export type PaneState = {
		/** The pane the track rests on, or is heading to. */
		shown: boolean;
		/** Shown or next to it: worth having mounted before a drag reaches it. */
		near: boolean;
		/** Any of it on screen right now, mid-drag or mid-slide included. */
		visible: boolean;
	};
</script>

<script lang="ts">
	import { untrack } from "svelte";
	import { prefersReducedMotion } from "svelte/motion";
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";

	import { type PanDirection, panPager } from "$lib/util/pan-pager";

	/**
	 * Sub-tabs side by side on one track that the finger drags and a transform
	 * moves, for a screen nested in the tab shell (Interest, Inbox).
	 *
	 * Not a native scroll-snap scroller: on Android a fling coasted past a tab
	 * and landed two away after the finger had lifted, and a tap from the first
	 * tab to the last scrolled through every one in between. Here a release
	 * moves one tab at most, decided as the finger lifts, and a tap slides
	 * straight there. At either end the swipe is left to the shell around it.
	 */
	let {
		count,
		index,
		onswipe,
		enabled = true,
		position = $bindable(0),
		gliding = $bindable(false),
		paneSlots = [],
		pane,
		...rest
	}: {
		count: number;
		/** The tab on show, as the route or state says. */
		index: number;
		/** A swipe has let go towards this tab; make it the one on show. */
		onswipe: (target: number) => void;
		enabled?: boolean;
		/** Where the track is, in tabs: 1.5 is halfway from the second to the third. */
		position?: number;
		/** True while the track eases to rest rather than following the finger. */
		gliding?: boolean;
		paneSlots?: string[];
		pane: Snippet<[number, PaneState]>;
	} & Omit<HTMLAttributes<HTMLDivElement>, "children"> = $props();

	const SETTLE_MS = 320;
	const SETTLE = `transform ${SETTLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
	// Horizontal wheel travel (px) that pages once, for trackpads.
	const WHEEL_STEP = 60;
	const WHEEL_REST_MS = 400;

	// Runs ahead of `index` on a swipe, so the track never jumps back while the
	// route is still catching up.
	let shownIndex = $state(untrack(() => index));
	let dragX = $state(0);
	let width = $state(0);
	// The pane a slide is leaving, kept mounted until it is off screen.
	let leaving = $state<number | null>(null);

	$effect(() => {
		const target = index;
		untrack(() => {
			if (target === shownIndex) return;
			slideTo(target);
		});
	});

	$effect(() => {
		position = shownIndex - (width > 0 ? dragX / width : 0);
	});

	// In case a slide ends without a transitionend (nothing to animate).
	$effect(() => {
		if (!gliding) return;
		const handle = setTimeout(endGlide, SETTLE_MS + 200);
		return () => clearTimeout(handle);
	});

	function slideTo(target: number) {
		leaving = shownIndex;
		gliding = !prefersReducedMotion.current;
		dragX = 0;
		shownIndex = target;
		if (!gliding) leaving = null;
	}

	function endGlide() {
		gliding = false;
		leaving = null;
	}

	function canGo(direction: PanDirection): boolean {
		const target = shownIndex + direction;
		return enabled && target >= 0 && target < count;
	}

	function commit(direction: PanDirection) {
		if (!canGo(direction)) {
			springBack();
			return;
		}
		slideTo(shownIndex + direction);
		onswipe(shownIndex);
	}

	function springBack() {
		gliding = dragX !== 0 && !prefersReducedMotion.current;
		dragX = 0;
	}

	let wheelTravel = 0;
	let wheelRest: ReturnType<typeof setTimeout> | undefined;
	let wheelSpent = false;
	function onwheel(event: WheelEvent) {
		if (!enabled || Math.abs(event.deltaX) <= Math.abs(event.deltaY))
			return;
		wheelTravel += event.deltaX;
		clearTimeout(wheelRest);
		wheelRest = setTimeout(() => {
			wheelTravel = 0;
			wheelSpent = false;
		}, WHEEL_REST_MS);
		if (wheelSpent || Math.abs(wheelTravel) < WHEEL_STEP) return;
		// One page per gesture: a trackpad's momentum keeps sending deltas.
		wheelSpent = true;
		const direction: PanDirection = wheelTravel > 0 ? 1 : -1;
		if (canGo(direction)) commit(direction);
	}

	function paneState(pane: number): PaneState {
		const offset = Math.abs(pane - position);
		return {
			shown: pane === shownIndex,
			near: Math.abs(pane - shownIndex) <= 1 || pane === leaving,
			visible: offset < 1 || pane === leaving,
		};
	}
</script>

<div
	{...rest}
	bind:clientWidth={width}
	data-pan-chain
	data-pan-first={shownIndex === 0 ? "" : undefined}
	data-pan-last={shownIndex === count - 1 ? "" : undefined}
	class={["relative overflow-hidden", rest.class]}
	use:panPager={{
		enabled,
		yieldAtEnds: true,
		canGo,
		onpan: (dx) => {
			gliding = false;
			dragX = dx;
		},
		oncommit: commit,
		oncancel: springBack,
	}}
	{onwheel}
>
	<div
		class="absolute inset-0"
		style:transform="translate3d(calc({-shownIndex * 100}% + {dragX}px), 0,
		0)"
		style:transition={gliding ? SETTLE : "none"}
		style:will-change={gliding || dragX !== 0 ? "transform" : "auto"}
		ontransitionend={(event) => {
			if (event.target === event.currentTarget) endGlide();
		}}
	>
		{#each { length: count }, index (index)}
			{@const state = paneState(index)}
			<div
				data-slot={paneSlots[index]}
				inert={!state.shown}
				aria-hidden={state.shown ? undefined : "true"}
				class="absolute inset-y-0 w-full overflow-hidden"
				style:left="{index * 100}%"
			>
				{@render pane(index, state)}
			</div>
		{/each}
	</div>
</div>
