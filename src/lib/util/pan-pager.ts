import type { Action } from "svelte/action";

/**
 * Interactive horizontal pager gesture — the finger drags the page, and
 * releasing past a threshold commits to the neighbouring page.
 *
 * Where {@link import("./swipe-tabs").swipeTabs} is fire-and-forget (it only
 * reports the flick once it is over), this one reports every frame so the
 * caller can move the content under the finger. The axis-locking, velocity
 * sampling and opt-out rules are deliberately the same as `swipeTabs`, right
 * down to being touch-only: iOS fires `pointercancel` the moment the WebView
 * starts scrolling, which kills any swipe whose first pixels drifted
 * vertically.
 */

// Fraction of the pager's width past which release commits a page change.
const COMMIT_DISTANCE_RATIO = 0.22;
// Horizontal velocity (px/ms) that commits regardless of distance.
const COMMIT_VELOCITY = 0.35;
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

/** +1 pages towards the next item (finger moving left), -1 towards the previous. */
export type PanDirection = 1 | -1;

export type PanPagerOptions = {
	/** Whether there is anything to page to in that direction. */
	canGo?: (direction: PanDirection) => boolean;
	/** Live horizontal travel (px) while the gesture is locked to "x". */
	onpan?: (dx: number) => void;
	/** Released past the threshold: page to the neighbour. */
	oncommit?: (direction: PanDirection) => void;
	/** Released short of the threshold, or cancelled: spring back. */
	oncancel?: () => void;
	enabled?: boolean;
};

type Open = { next: boolean; prev: boolean; chained: boolean };

/**
 * Which ways a gesture starting inside this target may page, or null if it
 * should be skipped. A horizontal scroller opts out, unless it is marked
 * `data-swipe-tabs-chain` (a nested pager): then a swipe past whichever end it
 * rests at is this pager's, and follows the finger like any other.
 */
function openDirections(
	target: EventTarget | null,
	root: HTMLElement,
): Open | null {
	if (document.querySelector(".pswp--open")) return null;
	const open = { next: true, prev: true, chained: false };
	let node = target instanceof Element ? target : null;
	while (node && node !== root && node !== document.body) {
		if (node.hasAttribute("data-pan-pager-ignore")) return null;
		const style = getComputedStyle(node);
		const scrollsX =
			(style.overflowX === "auto" || style.overflowX === "scroll") &&
			node.scrollWidth > node.clientWidth;
		if (scrollsX) {
			if (!node.hasAttribute("data-swipe-tabs-chain")) return null;
			open.chained = true;
			const left = Math.abs(node.scrollLeft);
			open.prev &&= left <= 1;
			open.next &&= left >= node.scrollWidth - node.clientWidth - 1;
			if (!open.next && !open.prev) return null;
		}
		node = node.parentElement;
	}
	return open;
}

export const panPager: Action<HTMLElement, PanPagerOptions | undefined> = (
	node,
	options,
) => {
	let opts = options ?? {};

	let touchId: number | null = null;
	let startX = 0;
	let startY = 0;
	// null until the gesture passes LOCK_DISTANCE on either axis.
	let axis: "x" | "y" | null = null;
	// Whether onpan has started reporting, so exactly one of oncommit/oncancel
	// answers it.
	let panning = false;
	// Recent positions, trimmed to VELOCITY_WINDOW, for the release velocity.
	let samples: Sample[] = [];
	let open: Open = { next: true, prev: true, chained: false };
	let lifts: AbortController | null = null;

	function reset() {
		lifts?.abort();
		lifts = null;
		touchId = null;
		axis = null;
		panning = false;
		samples = [];
	}

	function abort() {
		const wasPanning = panning;
		reset();
		if (wasPanning) opts.oncancel?.();
	}

	/** The tracked finger within a touch list, or null if it is not there. */
	function tracked(list: TouchList): Touch | null {
		for (const touch of list)
			if (touch.identifier === touchId) return touch;
		return null;
	}

	/**
	 * Average px/ms over the last {@link VELOCITY_WINDOW}. Sampling a window
	 * rather than the final touchmove matters because the finger usually
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
		// A second finger means a pinch or a two-handed scroll, not a page swipe.
		if (event.touches.length > 1) {
			abort();
			return;
		}
		// One finger down while a drag is still open: its lift never arrived, so
		// let it go rather than leave the page stuck mid-drag.
		if (touchId !== null) abort();
		const touch = event.changedTouches[0];
		if (!touch) return;
		if (touch.clientX <= EDGE_ZONE) return;
		const directions = openDirections(event.target, node);
		if (!directions) return;
		// On the touched element too: if it is re-rendered away mid-drag, its
		// lift no longer bubbles up to the pager.
		lifts?.abort();
		lifts = new AbortController();
		for (const [type, listener] of [
			["touchend", onTouchEnd],
			["touchcancel", onTouchCancel],
		] as const)
			event.target?.addEventListener(type, listener as EventListener, {
				passive: true,
				signal: lifts.signal,
			});
		open = directions;

		touchId = touch.identifier;
		startX = touch.clientX;
		startY = touch.clientY;
		axis = null;
		panning = false;
		samples = [{ x: touch.clientX, t: event.timeStamp }];
	}

	function onTouchMove(event: TouchEvent) {
		if (touchId === null) return;
		if (event.touches.length > 1) {
			abort();
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

		const dx = touch.clientX - startX;
		const dy = touch.clientY - startY;

		if (axis === null) {
			// Decide the axis once, from the first bit of travel, and stick with
			// it: judging the whole gesture on its total dx/dy ratio meant any
			// vertical drift over a long horizontal drag cancelled the swipe.
			const ax = Math.abs(dx);
			const ay = Math.abs(dy);
			if (ax >= LOCK_DISTANCE && ax >= ay * HORIZONTAL_BIAS) axis = "x";
			// Lock to "y" only when the gesture is clearly vertical, so a
			// slightly diagonal swipe is not written off before it has committed
			// to a direction. Anything in between stays undecided.
			else if (ay >= LOCK_DISTANCE && ax < ay * HORIZONTAL_BIAS)
				axis = "y";
			else if (Math.max(ax, ay) >= DECIDE_DISTANCE)
				axis = ax >= ay ? "x" : "y";
			else return;
		}
		if (axis !== "x") return;
		// A nested pager keeps the swipes it can still page itself.
		if (!panning && !(dx < 0 ? open.next : open.prev)) {
			reset();
			return;
		}

		// The container carries `touch-action: pan-y`, so the WebView never
		// starts a horizontal pan of its own; this stops the vertical scroller
		// from also following a swipe that has already locked to "x".
		if (event.cancelable) event.preventDefault();
		panning = true;
		opts.onpan?.(dx);
	}

	function onTouchEnd(event: TouchEvent) {
		if (touchId === null) return;
		const touch = tracked(event.changedTouches);
		if (!touch) return;
		release(touch.clientX);
	}

	/**
	 * iOS can cancel a touch that started in a nested pager once it is under
	 * way; that swipe is resolved from where the finger was last seen rather
	 * than dropped. Any other cancel springs back.
	 */
	function onTouchCancel(event: TouchEvent) {
		if (touchId === null) return;
		const last =
			tracked(event.changedTouches)?.clientX ?? samples.at(-1)?.x;
		if (!open.chained || !panning || last === undefined) {
			abort();
			return;
		}
		release(last);
	}

	function release(x: number) {
		const dx = x - startX;
		const velocity = releaseVelocity();
		const wasPanning = panning;
		reset();

		if (!wasPanning) return;

		const flick = Math.abs(velocity) > COMMIT_VELOCITY;
		const commit =
			flick || Math.abs(dx) > node.clientWidth * COMMIT_DISTANCE_RATIO;
		// A flick's direction is its velocity; a slow drag's is its net travel.
		const travel = flick ? -Math.sign(velocity) : -Math.sign(dx);
		const direction: PanDirection = travel >= 0 ? 1 : -1;

		if (!commit || travel === 0 || opts.canGo?.(direction) === false) {
			opts.oncancel?.();
			return;
		}
		opts.oncommit?.(direction);
	}

	// Not passive: a gesture locked to "x" calls preventDefault so the pane's
	// own vertical scroller stops following it.
	const active = { passive: false } as const;
	const passive = { passive: true } as const;
	node.addEventListener("touchstart", onTouchStart, passive);
	node.addEventListener("touchmove", onTouchMove, active);
	node.addEventListener("touchend", onTouchEnd, passive);
	node.addEventListener("touchcancel", onTouchCancel, passive);

	return {
		update(next) {
			opts = next ?? {};
		},
		destroy() {
			node.removeEventListener("touchstart", onTouchStart);
			node.removeEventListener("touchmove", onTouchMove);
			node.removeEventListener("touchend", onTouchEnd);
			node.removeEventListener("touchcancel", onTouchCancel);
			lifts?.abort();
		},
	};
};
