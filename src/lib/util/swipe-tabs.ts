import type { Action } from "svelte/action";

/**
 * Horizontal "swipe to change tab" gesture.
 *
 * Attach to the tab content container: a fast horizontal flick (or a long
 * enough drag) fires {@link SwipeTabsOptions.onNext} / `onPrev`. The gesture
 * is touch-only and deliberately conservative so it does not fight vertical
 * scrolling, horizontally scrollable rails/carousels, or the left-edge
 * swipe-back gesture.
 *
 * Instances nest. A screen with its own sub-tabs (Interest, Inbox) sits inside
 * the one that moves between the bottom bar's tabs, and a swipe is offered to
 * the innermost one first: a handler that returns `false` — "I am already at
 * that end" — passes the swipe outward, so a flick past the last sub-tab
 * carries on to the next tab instead of dying at the boundary.
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
	/**
	 * Return `false` to decline the swipe and hand it to the enclosing
	 * instance. Anything else (including `undefined`) counts as handled.
	 */
	onNext?: () => boolean | void;
	onPrev?: () => boolean | void;
	enabled?: boolean;
};

type Instance = { node: HTMLElement; opts: SwipeTabsOptions };

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
 * Every mounted instance. One gesture is tracked at a time for all of them —
 * see {@link chain} — so the listeners are installed once rather than per
 * instance.
 */
const instances = new Set<Instance>();

let touchId: number | null = null;
let startX = 0;
let startY = 0;
// null until the gesture passes LOCK_DISTANCE on either axis.
let axis: "x" | "y" | null = null;
// Recent positions, trimmed to VELOCITY_WINDOW, for the release velocity.
let samples: Sample[] = [];
// The instances containing the touched element, innermost first, fixed at
// touchstart: the element can be gone by the time the finger lifts.
let chain: Instance[] = [];

function reset() {
	touchId = null;
	axis = null;
	samples = [];
	chain = [];
}

/**
 * How many elements up from `target` the node sits, or null if it is not an
 * ancestor. DOM containment, so a `display: contents` wrapper counts the same
 * as a painted box.
 */
function ancestorDistance(node: HTMLElement, target: Element): number | null {
	let distance = 0;
	let element: Element | null = target;
	while (element) {
		if (element === node) return distance;
		element = element.parentElement;
		distance += 1;
	}
	return null;
}

/** The enabled instances around the touched element, innermost first. */
function chainFor(target: EventTarget | null): Instance[] {
	if (!(target instanceof Element)) return [];
	const matches: { instance: Instance; distance: number }[] = [];
	for (const instance of instances) {
		if (instance.opts.enabled === false) continue;
		const distance = ancestorDistance(instance.node, target);
		if (distance !== null) matches.push({ instance, distance });
	}
	return matches
		.sort((a, b) => a.distance - b.distance)
		.map((match) => match.instance);
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

	const candidates = chainFor(event.target);
	if (candidates.length === 0) return;

	touchId = touch.identifier;
	startX = touch.clientX;
	startY = touch.clientY;
	axis = null;
	samples = [{ x: touch.clientX, t: event.timeStamp }];
	chain = candidates;
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

/** Offer the swipe outward until an instance takes it. */
function dispatch(direction: number, candidates: Instance[]) {
	for (const { opts } of candidates) {
		if (opts.enabled === false) continue;
		const handler = direction < 0 ? opts.onNext : opts.onPrev;
		if (!handler) continue;
		if (handler() !== false) return;
	}
}

function onTouchEnd(event: TouchEvent) {
	if (touchId === null) return;
	const touch = tracked(event.changedTouches);
	if (!touch) return;
	const dx = touch.clientX - startX;
	const horizontal = axis === "x";
	const velocity = releaseVelocity();
	const candidates = chain;
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
	dispatch(direction, candidates);
}

// Passive: the gesture never calls preventDefault, so the WebView is free to
// scroll normally while we watch.
const passive = { passive: true } as const;

function listen() {
	window.addEventListener("touchstart", onTouchStart, passive);
	window.addEventListener("touchmove", onTouchMove, passive);
	window.addEventListener("touchend", onTouchEnd, passive);
	window.addEventListener("touchcancel", reset, passive);
}

function unlisten() {
	window.removeEventListener("touchstart", onTouchStart);
	window.removeEventListener("touchmove", onTouchMove);
	window.removeEventListener("touchend", onTouchEnd);
	window.removeEventListener("touchcancel", reset);
}

/**
 * Listens on `window` (not the node) so the whole screen is swipeable without
 * a layout-affecting wrapper: the node is only an anchor for the action
 * lifecycle and for working out which instance a touch belongs to.
 * Content's own vertical scroll containers are unaffected, and horizontally
 * scrollable descendants opt out via {@link shouldIgnoreStart}.
 *
 * Touch events rather than pointer events: iOS fires `pointercancel` as soon as
 * the WebView starts scrolling, which killed any swipe whose first few pixels
 * of vertical drift nudged the scroller — only a dead-straight horizontal swipe
 * survived. Touch events keep being delivered through a scroll.
 */
export const swipeTabs: Action<HTMLElement, SwipeTabsOptions | undefined> = (
	node,
	options,
) => {
	const instance: Instance = { node, opts: options ?? {} };
	if (instances.size === 0) listen();
	instances.add(instance);

	return {
		update(next) {
			instance.opts = next ?? {};
		},
		destroy() {
			instances.delete(instance);
			chain = chain.filter((entry) => entry !== instance);
			if (instances.size === 0) unlisten();
		},
	};
};
