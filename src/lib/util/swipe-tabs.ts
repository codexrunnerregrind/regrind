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
// Travel (px) on the dominant axis after which the gesture can lock.
const LOCK_DISTANCE = 10;
// Fraction of the vertical travel the horizontal travel must reach to lock to
// "x". Below 1 because a thumb swipe arcs: a genuine horizontal flick routinely
// picks up a comparable amount of vertical drift on the way out.
const HORIZONTAL_BIAS = 0.55;
// Travel (px) at which an ambiguous gesture stops waiting and takes the larger
// axis, so a diagonal drag still resolves instead of hanging unlocked.
const DECIDE_DISTANCE = 28;
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
 *
 * Touch events rather than pointer events: iOS fires `pointercancel` as soon as
 * the WebView starts scrolling, which killed any swipe whose first few pixels
 * of vertical drift nudged the scroller — only a dead-straight horizontal swipe
 * survived. Touch events keep being delivered through a scroll.
 */
export const swipeTabs: Action<HTMLElement, SwipeTabsOptions | undefined> = (
	_node,
	options,
) => {
	let opts = options ?? {};

	let touchId: number | null = null;
	let startX = 0;
	let startY = 0;
	// null until the gesture passes LOCK_DISTANCE on either axis.
	let axis: "x" | "y" | null = null;
	// Recent positions, trimmed to VELOCITY_WINDOW, for the release velocity.
	let samples: Sample[] = [];

	function reset() {
		touchId = null;
		axis = null;
		samples = [];
	}

	/** The tracked finger within a touch list, or null if it is not there. */
	function tracked(list: TouchList): Touch | null {
		for (const touch of list) if (touch.identifier === touchId) return touch;
		return null;
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

	function onTouchStart(event: TouchEvent) {
		if (opts.enabled === false) return;
		// A second finger means a pinch or a two-handed scroll, not a tab swipe.
		if (event.touches.length > 1) {
			reset();
			return;
		}
		if (touchId !== null) return;
		const touch = event.changedTouches[0];
		if (!touch) return;
		if (touch.clientX <= EDGE_ZONE) return;
		if (shouldIgnoreStart(event.target)) return;

		touchId = touch.identifier;
		startX = touch.clientX;
		startY = touch.clientY;
		axis = null;
		samples = [{ x: touch.clientX, t: event.timeStamp }];
	}

	function onTouchMove(event: TouchEvent) {
		if (touchId === null) return;
		if (event.touches.length > 1) {
			reset();
			return;
		}
		const touch = tracked(event.touches);
		if (!touch) return;

		samples.push({ x: touch.clientX, t: event.timeStamp });
		while (
			samples.length > 2 &&
			event.timeStamp - (samples[0]?.t ?? 0) > VELOCITY_WINDOW
		)
			samples.shift();

		if (axis !== null) return;

		// Decide the axis once, from the first bit of travel, and stick with it:
		// judging the whole gesture on its total dx/dy ratio meant any vertical
		// drift over a long horizontal drag cancelled the swipe.
		const dx = Math.abs(touch.clientX - startX);
		const dy = Math.abs(touch.clientY - startY);

		// Lock to "x" as soon as the horizontal travel is far enough and not
		// dwarfed by the vertical one.
		if (dx >= LOCK_DISTANCE && dx >= dy * HORIZONTAL_BIAS) {
			axis = "x";
			return;
		}
		// Lock to "y" only when the gesture is clearly vertical, so a slightly
		// diagonal swipe is not written off before it has committed to a
		// direction. Anything in between stays undecided and keeps sampling.
		if (dy >= LOCK_DISTANCE && dx < dy * HORIZONTAL_BIAS) {
			axis = "y";
			return;
		}
		if (Math.max(dx, dy) >= DECIDE_DISTANCE) axis = dx >= dy ? "x" : "y";
	}

	function onTouchEnd(event: TouchEvent) {
		if (touchId === null) return;
		const touch = tracked(event.changedTouches);
		if (!touch) return;
		const dx = touch.clientX - startX;
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

	// Passive: the gesture never calls preventDefault, so the WebView is free to
	// scroll normally while we watch.
	const passive = { passive: true } as const;
	window.addEventListener("touchstart", onTouchStart, passive);
	window.addEventListener("touchmove", onTouchMove, passive);
	window.addEventListener("touchend", onTouchEnd, passive);
	window.addEventListener("touchcancel", reset, passive);

	return {
		update(next) {
			opts = next ?? {};
		},
		destroy() {
			window.removeEventListener("touchstart", onTouchStart);
			window.removeEventListener("touchmove", onTouchMove);
			window.removeEventListener("touchend", onTouchEnd);
			window.removeEventListener("touchcancel", reset);
		},
	};
};
