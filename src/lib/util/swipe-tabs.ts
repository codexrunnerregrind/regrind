import type { Action } from "svelte/action";

/**
 * Horizontal "swipe to change tab" gesture.
 *
 * Attach to the tab content container: a fast horizontal flick (or a long
 * enough drag) fires {@link SwipeTabsOptions.onNext} / `onPrev`. The gesture
 * is touch-only and deliberately conservative so it does not fight vertical
 * scrolling, horizontally scrollable rails/carousels, or the left-edge
 * swipe-back gesture.
 */

// Horizontal travel (px) that commits a tab change on release.
const COMMIT_DISTANCE = 45;
// Horizontal velocity (px/ms) that commits regardless of distance.
const COMMIT_VELOCITY = 0.25;
// Travel (px) after which the gesture locks to one axis.
const LOCK_DISTANCE = 10;
// At lock time the gesture must be this many times more horizontal than vertical.
const HORIZONTAL_BIAS = 1;
// Window (ms) the release velocity is averaged over.
const VELOCITY_WINDOW = 120;
// Left-edge zone (px) reserved for the swipe-back gesture.
const EDGE_ZONE = 30;

type Sample = { x: number; t: number };

export type SwipeTabsOptions = {
	onNext?: () => void;
	onPrev?: () => void;
	enabled?: boolean;
};

/** Whether the gesture should be skipped for a start inside this target. */
function shouldIgnoreStart(target: EventTarget | null): boolean {
	if (document.querySelector(".pswp--open")) return true;
	let node = target instanceof Element ? target : null;
	while (node && node !== document.body) {
		if (node.hasAttribute("data-swipe-tabs-ignore")) return true;
		const style = getComputedStyle(node);
		const scrollsX =
			(style.overflowX === "auto" || style.overflowX === "scroll") &&
			node.scrollWidth > node.clientWidth;
		if (scrollsX) return true;
		node = node.parentElement;
	}
	return false;
}

/**
 * Listens on `window` (not the node) so the whole screen is swipeable without
 * a layout-affecting wrapper: the node is only an anchor for the action
 * lifecycle. Content's own vertical scroll containers are unaffected, and
 * horizontally scrollable descendants opt out via {@link shouldIgnoreStart}.
 */
export const swipeTabs: Action<HTMLElement, SwipeTabsOptions | undefined> = (
	_node,
	options,
) => {
	let opts = options ?? {};

	let pointerId: number | null = null;
	let startX = 0;
	let startY = 0;
	// null until the gesture passes LOCK_DISTANCE on either axis.
	let axis: "x" | "y" | null = null;
	// Recent positions, trimmed to VELOCITY_WINDOW, for the release velocity.
	let samples: Sample[] = [];

	function reset() {
		pointerId = null;
		axis = null;
		samples = [];
	}

	/**
	 * Average px/ms over the last {@link VELOCITY_WINDOW}. Sampling a window
	 * rather than the final pointermove matters because the finger usually
	 * decelerates just before lifting, which makes the instantaneous velocity
	 * of a genuine flick read as ~0.
	 */
	function releaseVelocity(): number {
		const newest = samples.at(-1);
		const oldest = samples[0];
		if (!newest || !oldest) return 0;
		const dt = newest.t - oldest.t;
		if (dt <= 0) return 0;
		return (newest.x - oldest.x) / dt;
	}

	function onPointerDown(event: PointerEvent) {
		if (opts.enabled === false) return;
		if (event.pointerType === "mouse") return;
		if (pointerId !== null) return;
		if (event.clientX <= EDGE_ZONE) return;
		if (shouldIgnoreStart(event.target)) return;

		pointerId = event.pointerId;
		startX = event.clientX;
		startY = event.clientY;
		axis = null;
		samples = [{ x: event.clientX, t: event.timeStamp }];
	}

	function onPointerMove(event: PointerEvent) {
		if (event.pointerId !== pointerId) return;

		samples.push({ x: event.clientX, t: event.timeStamp });
		while (
			samples.length > 2 &&
			event.timeStamp - (samples[0]?.t ?? 0) > VELOCITY_WINDOW
		)
			samples.shift();

		if (axis !== null) return;

		// Decide the axis once, from the first bit of travel, and stick with it:
		// judging the whole gesture on its total dx/dy ratio meant any vertical
		// drift over a long horizontal drag cancelled the swipe.
		const dx = event.clientX - startX;
		const dy = event.clientY - startY;
		if (Math.abs(dx) < LOCK_DISTANCE && Math.abs(dy) < LOCK_DISTANCE) return;
		axis = Math.abs(dx) >= Math.abs(dy) * HORIZONTAL_BIAS ? "x" : "y";
	}

	function onPointerEnd(event: PointerEvent) {
		if (event.pointerId !== pointerId) return;
		const dx = event.clientX - startX;
		const horizontal = axis === "x";
		const velocity = releaseVelocity();
		reset();

		if (!horizontal) return;

		const commit =
			Math.abs(dx) > COMMIT_DISTANCE || Math.abs(velocity) > COMMIT_VELOCITY;
		if (!commit) return;

		// A flick's direction is its velocity; a slow drag's is its net travel.
		const direction =
			Math.abs(velocity) > COMMIT_VELOCITY
				? Math.sign(velocity)
				: Math.sign(dx);
		if (direction < 0) opts.onNext?.();
		else opts.onPrev?.();
	}

	window.addEventListener("pointerdown", onPointerDown);
	window.addEventListener("pointermove", onPointerMove);
	window.addEventListener("pointerup", onPointerEnd);
	window.addEventListener("pointercancel", reset);

	return {
		update(next) {
			opts = next ?? {};
		},
		destroy() {
			window.removeEventListener("pointerdown", onPointerDown);
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerup", onPointerEnd);
			window.removeEventListener("pointercancel", reset);
		},
	};
};
