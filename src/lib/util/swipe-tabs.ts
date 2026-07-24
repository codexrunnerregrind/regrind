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
const COMMIT_DISTANCE = 60;
// Horizontal velocity (px/ms) that commits regardless of distance.
const COMMIT_VELOCITY = 0.4;
// The gesture must be this many times more horizontal than vertical.
const HORIZONTAL_BIAS = 1.3;
// Left-edge zone (px) reserved for the swipe-back gesture.
const EDGE_ZONE = 30;

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
	let lastX = 0;
	let lastT = 0;
	let velocity = 0;

	function reset() {
		pointerId = null;
	}

	function onPointerDown(event: PointerEvent) {
		if (opts.enabled === false) return;
		if (event.pointerType === "mouse") return;
		if (pointerId !== null) return;
		if (event.clientX <= EDGE_ZONE) return;
		if (shouldIgnoreStart(event.target)) return;

		pointerId = event.pointerId;
		startX = lastX = event.clientX;
		startY = event.clientY;
		lastT = event.timeStamp;
		velocity = 0;
	}

	function onPointerMove(event: PointerEvent) {
		if (event.pointerId !== pointerId) return;
		const dt = event.timeStamp - lastT;
		if (dt > 0) velocity = (event.clientX - lastX) / dt;
		lastX = event.clientX;
		lastT = event.timeStamp;
	}

	function onPointerEnd(event: PointerEvent) {
		if (event.pointerId !== pointerId) return;
		const dx = event.clientX - startX;
		const dy = event.clientY - startY;
		reset();

		if (Math.abs(dx) < Math.abs(dy) * HORIZONTAL_BIAS) return;

		const commit =
			Math.abs(dx) > COMMIT_DISTANCE || Math.abs(velocity) > COMMIT_VELOCITY;
		if (!commit) return;

		if (dx < 0) opts.onNext?.();
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
