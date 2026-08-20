import type { Action } from "svelte/action";

/**
 * Horizontal "swipe to change tab" gesture, tracking the finger.
 *
 * The screen follows the thumb; releasing past a threshold (or with enough
 * velocity) carries it the rest of the way out, swaps the content while it is
 * off-screen, and brings the new tab in from the other side. Releasing short of
 * it springs back. Touch-only, and deliberately conservative so it does not
 * fight vertical scrolling, horizontally scrollable rails/carousels, or the
 * left-edge swipe-back gesture.
 *
 * Instances nest. A screen with its own sub-tabs (Interest, Inbox) sits inside
 * the one that moves between the bottom bar's tabs, and a swipe is offered to
 * the innermost one first: a handler that returns `false` — "I am already at
 * that end" — passes the swipe outward, so a flick past the last sub-tab
 * carries on to the next tab instead of dying at the boundary. `canNext` /
 * `canPrev` answer the same question before the gesture commits, because the
 * drag has to know whether there is anything that way to decide between
 * following the finger and rubber-banding against a dead end.
 *
 * Only the outermost instance's node moves — it is the page shell, the box the
 * tab bar sits outside of. Inner instances are there to claim the gesture, not
 * to be animated.
 */

// Fraction of the shell's width past which release commits a tab change.
const COMMIT_DISTANCE_RATIO = 0.2;
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
// How much of the drag a dead end gives back, so the far ends of the tab bar
// answer the finger without pretending there is somewhere to go. The profile
// pager's figure, because it is the same gesture meeting the same wall.
const RUBBER_BAND = 0.35;

// Carrying the rest of the way out is quick — the finger has already done most
// of it. Arriving and springing back share the profile pager's settle, so a tab
// change and a profile change land the same way.
const OUT_MS = 160;
const IN_MS = 320;
const SPRING_MS = 320;
const EASE_OUT = "cubic-bezier(0.32, 0.72, 0, 1)";
const EASE_IN = "cubic-bezier(0.22, 1, 0.36, 1)";

type Sample = { x: number; t: number };

/** What a handler reports: `false` declines, a promise is the navigation. */
type SwipeResult = boolean | void | Promise<unknown>;

export type SwipeTabsOptions = {
	/**
	 * Return `false` to decline the swipe and hand it to the enclosing
	 * instance. A promise is awaited, so the incoming tab is only animated in
	 * once its content is there.
	 */
	onNext?: () => SwipeResult;
	onPrev?: () => SwipeResult;
	/**
	 * Whether this instance would take the swipe. Asked while the finger is
	 * down; an instance with no answer is treated as a dead end, so a screen
	 * only moves once something says it can.
	 */
	canNext?: () => boolean;
	canPrev?: () => boolean;
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
// The shell being dragged, and whether the drag has moved it at all.
let surface: HTMLElement | null = null;
let dragging = false;
// A release animation owns the screen until it is done; a second swipe in the
// middle of one would be dragging a shell that is on its way out.
let settling = false;

function reset() {
	touchId = null;
	axis = null;
	samples = [];
	chain = [];
	surface = null;
	dragging = false;
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

/**
 * The shell the tab content lives in: the outermost enabled instance anywhere
 * in the document. Re-read after navigating rather than remembered, because
 * Inbox and the other four tabs are separate layouts — crossing between them
 * replaces the shell rather than its contents.
 */
function shell(): HTMLElement | null {
	let best: { node: HTMLElement; depth: number } | null = null;
	for (const { node, opts } of instances) {
		if (opts.enabled === false) continue;
		if (!node.isConnected) continue;
		const depth = ancestorDistance(document.documentElement, node);
		if (depth === null) continue;
		if (!best || depth < best.depth) best = { node, depth };
	}
	return best?.node ?? null;
}

/** The tracked finger within a touch list, or null if it is not there. */
function tracked(list: TouchList): Touch | null {
	for (const touch of list) if (touch.identifier === touchId) return touch;
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

/** Whether anything in the chain would take a swipe that way. */
function canGo(direction: number, candidates: Instance[]): boolean {
	for (const { opts } of candidates) {
		if (opts.enabled === false) continue;
		const can = direction < 0 ? opts.canNext : opts.canPrev;
		if (can?.() === true) return true;
	}
	return false;
}

/** Offer the swipe outward until an instance takes it. */
function take(
	direction: number,
	candidates: Instance[],
): { handled: boolean; navigation?: Promise<unknown> } {
	for (const { opts } of candidates) {
		if (opts.enabled === false) continue;
		const handler = direction < 0 ? opts.onNext : opts.onPrev;
		if (!handler) continue;
		const result = handler();
		if (result === false) continue;
		return {
			handled: true,
			navigation: result instanceof Promise ? result : undefined,
		};
	}
	return { handled: false };
}

function reducedMotion(): boolean {
	return (
		window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
	);
}

function frame(): Promise<void> {
	return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Put the shell at an offset with no animation. */
function place(node: HTMLElement, x: number) {
	node.style.transition = "none";
	node.style.willChange = "transform";
	node.style.transform = x === 0 ? "" : `translate3d(${x}px, 0, 0)`;
}

/** Animate the shell to an offset, resolving when it gets there. */
function ride(
	node: HTMLElement,
	x: number,
	ms: number,
	ease: string,
): Promise<void> {
	return new Promise((resolve) => {
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			node.removeEventListener("transitionend", onEnd);
			clearTimeout(timer);
			resolve();
		};
		const onEnd = (event: TransitionEvent) => {
			if (event.target === node && event.propertyName === "transform")
				finish();
		};
		// The timeout is the one that fires when the transform it is asked for
		// is the one it already has, which produces no transitionend at all.
		const timer = setTimeout(finish, ms + 80);
		node.addEventListener("transitionend", onEnd);
		node.style.transition = `transform ${ms}ms ${ease}`;
		node.style.transform = x === 0 ? "" : `translate3d(${x}px, 0, 0)`;
	});
}

function unstyle(node: HTMLElement) {
	node.style.transition = "";
	node.style.transform = "";
	node.style.willChange = "";
}

/**
 * Carry the shell out, swap the tab under it, and bring the new one in from the
 * other side. The content only changes while it is off-screen, which is what
 * lets one shell stand in for two pages.
 */
async function settle(
	outgoing: HTMLElement,
	direction: number,
	candidates: Instance[],
) {
	settling = true;
	try {
		const width = outgoing.clientWidth || window.innerWidth;
		if (reducedMotion()) {
			unstyle(outgoing);
			const { navigation } = take(direction, candidates);
			await navigation;
			return;
		}

		await ride(outgoing, direction * width, OUT_MS, EASE_OUT);
		const { handled, navigation } = take(direction, candidates);
		if (!handled) {
			// Nothing took it after all: come back rather than sit off-screen.
			await ride(outgoing, 0, IN_MS, EASE_IN);
			unstyle(outgoing);
			return;
		}
		await navigation;

		// Crossing between Inbox and the rest replaces the shell, so ask again
		// which one is on screen. Placed before yielding to a frame, so the
		// incoming tab is never painted at rest first.
		const incoming = shell() ?? outgoing;
		place(incoming, -direction * width);
		if (incoming !== outgoing) unstyle(outgoing);
		await frame();
		await ride(incoming, 0, IN_MS, EASE_IN);
		unstyle(incoming);
	} finally {
		settling = false;
	}
}

function onTouchStart(event: TouchEvent) {
	if (settling) return;
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
	surface = candidates.at(-1)?.node ?? null;
	dragging = false;
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
		// Decide the axis once, from the first bit of travel, and stick with it:
		// judging the whole gesture on its total dx/dy ratio meant any vertical
		// drift over a long horizontal drag cancelled the swipe.
		const ax = Math.abs(dx);
		const ay = Math.abs(dy);
		// Lock to "x" as soon as the horizontal travel is far enough and not
		// dwarfed by the vertical one.
		if (ax >= LOCK_DISTANCE && ax >= ay * HORIZONTAL_BIAS) axis = "x";
		// Lock to "y" only when the gesture is clearly vertical, so a slightly
		// diagonal swipe is not written off before it has committed to a
		// direction. Anything in between stays undecided and keeps sampling.
		else if (ay >= LOCK_DISTANCE && ax < ay * HORIZONTAL_BIAS) axis = "y";
		else if (Math.max(ax, ay) >= DECIDE_DISTANCE)
			axis = ax >= ay ? "x" : "y";
		else return;
	}
	if (axis !== "x" || !surface) return;

	const open = canGo(Math.sign(dx), chain);
	// A screen with nowhere to go either way is not in the pager at all — a
	// settings subpage, somebody's profile — so it neither moves nor takes the
	// gesture off the scroller. Only a dead end within the pager gives.
	if (!open && !canGo(-Math.sign(dx), chain)) return;

	// Nothing is passive about a drag: the vertical scroller would otherwise
	// keep following a gesture that has already locked to "x".
	if (event.cancelable) event.preventDefault();
	dragging = true;
	place(surface, open ? dx : dx * RUBBER_BAND);
}

function onTouchEnd(event: TouchEvent) {
	if (touchId === null) return;
	const touch = tracked(event.changedTouches);
	if (!touch) return;
	const dx = touch.clientX - startX;
	const wasDragging = dragging;
	const outgoing = surface;
	const candidates = chain;
	const velocity = releaseVelocity();
	reset();

	if (!wasDragging || !outgoing) return;

	const width = outgoing.clientWidth || window.innerWidth;
	const flick = Math.abs(velocity) > COMMIT_VELOCITY;
	const commit = flick || Math.abs(dx) > width * COMMIT_DISTANCE_RATIO;
	// A flick's direction is its velocity; a slow drag's is its net travel.
	const direction = flick ? Math.sign(velocity) : Math.sign(dx);

	if (!commit || direction === 0 || !canGo(direction, candidates)) {
		void ride(outgoing, 0, SPRING_MS, EASE_IN).then(() =>
			unstyle(outgoing),
		);
		return;
	}
	void settle(outgoing, direction, candidates);
}

/** Cancelled mid-drag: put the shell back where it was. */
function abort() {
	const outgoing = dragging ? surface : null;
	reset();
	if (outgoing)
		void ride(outgoing, 0, SPRING_MS, EASE_IN).then(() =>
			unstyle(outgoing),
		);
}

const passive = { passive: true } as const;
// touchmove alone is active, so a gesture locked to "x" can call
// preventDefault; the rest never do.
const active = { passive: false } as const;

function listen() {
	window.addEventListener("touchstart", onTouchStart, passive);
	window.addEventListener("touchmove", onTouchMove, active);
	window.addEventListener("touchend", onTouchEnd, passive);
	window.addEventListener("touchcancel", abort, passive);
}

function unlisten() {
	window.removeEventListener("touchstart", onTouchStart);
	window.removeEventListener("touchmove", onTouchMove);
	window.removeEventListener("touchend", onTouchEnd);
	window.removeEventListener("touchcancel", abort);
}

/**
 * Listens on `window` (not the node) so the whole screen is swipeable without
 * a layout-affecting wrapper: the node is what works out which instance a
 * touch belongs to, and — for the outermost one — what moves. Content's own
 * vertical scroll containers are unaffected, and horizontally scrollable
 * descendants opt out via {@link shouldIgnoreStart}.
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
			if (surface === node) {
				surface = null;
				dragging = false;
			}
			if (instances.size === 0) unlisten();
		},
	};
};
