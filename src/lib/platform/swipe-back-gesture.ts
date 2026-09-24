import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
import {
	showSwipeBackGhost,
	type SwipeBackGhost,
} from "$lib/platform/swipe-back-ghost";
import {
	backGestureOverlayOpen,
	beginEdgeSwipeBack,
	type EdgeSwipe,
} from "$lib/platform/system-back-gesture";
import { canGoBack } from "$lib/util/history";

/**
 * Interactive left-edge "swipe to go back" gesture.
 *
 * WKWebView (iOS) does not provide the native back/forward swipe for
 * SPA history, so we implement it ourselves. The current screen is
 * dragged to the right following the finger; releasing past a threshold
 * (or with enough velocity) commits a back navigation, otherwise it
 * springs back into place.
 *
 * Back navigation is routed through {@link backGestureEventHandlers} so a
 * swipe first dismisses any open sheet/dialog (mirroring the Android
 * hardware-back behavior) before falling through to `history.back()`.
 *
 * Inside a page stack the stack takes the drag instead, sliding the page off
 * the one beneath it (see {@link beginEdgeSwipeBack}). Elsewhere the screen
 * being returned to is shown beneath from a snapshot, when one was kept.
 */

// Width of the left-edge zone (px) where a drag may begin.
const EDGE_ZONE = 30;
// Horizontal travel (px) before the gesture is considered intentional.
const ACTIVATION_SLOP = 12;
// Fraction of the viewport width past which release commits a back nav.
const COMMIT_DISTANCE_RATIO = 0.35;
// Horizontal velocity (px/ms) that commits regardless of distance.
const COMMIT_VELOCITY = 0.4;
const SETTLE = "220ms cubic-bezier(0.22, 1, 0.36, 1)";
// Past this a committed swipe gives up waiting for the page it went back to.
const NAVIGATION_WATCHDOG_MS = 1000;

let settleAfterNavigation: (() => void) | null = null;

/** Lets a committed swipe drop its snapshot once the page beneath rendered. */
export function settleSwipeBack(): void {
	settleAfterNavigation?.();
}

function runBackGestureHandlers(): boolean {
	const handlers = [...backGestureEventHandlers];
	for (let index = handlers.length - 1; index >= 0; index--) {
		if (handlers[index]?.() !== true) return true;
	}
	return false;
}

function navigateBack() {
	if (runBackGestureHandlers()) return;
	if (canGoBack()) history.back();
}

/**
 * Skip the gesture when it would fight another horizontal interaction:
 * a horizontally scrollable ancestor (filter rails, carousels) or an
 * open media lightbox with its own drag handling.
 */
function shouldIgnoreStart(target: EventTarget | null): boolean {
	if (document.querySelector(".pswp--open")) return true;
	let node = target instanceof Element ? target : null;
	while (node && node !== document.body) {
		if (node.hasAttribute("data-swipe-back-ignore")) return true;
		const style = getComputedStyle(node);
		const scrollsX =
			(style.overflowX === "auto" || style.overflowX === "scroll") &&
			node.scrollWidth > node.clientWidth;
		if (scrollsX) return true;
		node = node.parentElement;
	}
	return false;
}

// iOS draws a focused field's caret and selection in a native overlay that
// neither a transform nor a layout offset carries along, so a drag strands it
// as a dark bar across the composer — and being native, no CSS on the field
// reaches it. Ending the editing session is the only thing that clears it,
// which is also what a back gesture does in most iOS apps. The cost is a
// cancelled swipe coming back without the keyboard.
function blurEditing() {
	const editing = document.activeElement;
	if (
		editing instanceof HTMLInputElement ||
		editing instanceof HTMLTextAreaElement ||
		(editing instanceof HTMLElement && editing.isContentEditable)
	)
		editing.blur();
}

export function applySwipeBackGesture(): () => void {
	const screen = document.getElementById("screen-nav-root");
	if (!screen) return () => {};

	let pointerId: number | null = null;
	let startX = 0;
	let startY = 0;
	let lastX = 0;
	let lastT = 0;
	let velocity = 0;
	let active = false;
	let driven: EdgeSwipe | null = null;
	let ghost: SwipeBackGhost | null = null;

	function reset() {
		driven = null;
		ghost?.remove();
		ghost = null;
		settleAfterNavigation = null;
		pointerId = null;
		active = false;
		screen!.style.transition = "";
		screen!.style.transform = "";
		screen!.style.willChange = "";
		screen!.style.boxShadow = "";
		screen!.style.background = "";
		screen!.style.minHeight = "";
	}

	function afterTransition(done: () => void) {
		const finish = () => {
			screen!.removeEventListener("transitionend", onEnd);
			clearTimeout(fallback);
			done();
		};
		// Bubbles up from the page's own transitions too.
		const onEnd = (event: TransitionEvent) => {
			if (event.target === screen) finish();
		};
		// transitionend is skipped when nothing actually moves.
		const fallback = setTimeout(finish, 300);
		screen!.addEventListener("transitionend", onEnd);
	}

	function commitWithGhost() {
		screen!.style.transition = `transform ${SETTLE}`;
		ghost!.settle(1, SETTLE);
		screen!.style.transform = `translateX(${window.innerWidth}px)`;
		afterTransition(() => {
			const watchdog = setTimeout(reset, NAVIGATION_WATCHDOG_MS);
			settleAfterNavigation = () => {
				clearTimeout(watchdog);
				screen!.style.transition = "none";
				reset();
			};
			navigateBack();
		});
	}

	function cancelWithGhost() {
		screen!.style.transition = `transform ${SETTLE}`;
		ghost!.settle(0, SETTLE);
		screen!.style.transform = "translateX(0px)";
		afterTransition(reset);
	}

	function onPointerDown(event: PointerEvent) {
		if (event.pointerType === "mouse") return;
		// A ghost outlives the finger while the release settles.
		if (pointerId !== null || ghost) return;
		if (event.clientX > EDGE_ZONE) return;
		if (!canGoBack() && !backGestureOverlayOpen()) return;
		if (shouldIgnoreStart(event.target)) return;

		pointerId = event.pointerId;
		startX = lastX = event.clientX;
		startY = event.clientY;
		lastT = event.timeStamp;
		velocity = 0;
		active = false;
	}

	function onPointerMove(event: PointerEvent) {
		if (event.pointerId !== pointerId) return;

		const dx = event.clientX - startX;
		const dy = event.clientY - startY;

		if (!active) {
			// Give up if the movement is mostly vertical (a scroll).
			if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > ACTIVATION_SLOP) {
				pointerId = null;
				return;
			}
			if (dx < ACTIVATION_SLOP) return;
			active = true;
			blurEditing();
			driven = beginEdgeSwipeBack();
			if (driven) {
				event.preventDefault();
				return;
			}
			try {
				screen!.setPointerCapture(event.pointerId);
			} catch {
				// Pointer may already be released; capture is best-effort.
			}
			screen!.style.transition = "none";
			screen!.style.willChange = "transform";
			screen!.style.boxShadow = "-12px 0 24px rgba(0, 0, 0, 0.35)";
			if (canGoBack() && !backGestureOverlayOpen()) {
				ghost = showSwipeBackGhost(screen!);
				if (ghost) {
					// The page has to hide the copy beneath it while it is dragged.
					screen!.style.background = "var(--background)";
					screen!.style.minHeight = "100dvh";
				}
			}
		}

		const dt = event.timeStamp - lastT;
		if (dt > 0) velocity = (event.clientX - lastX) / dt;
		lastX = event.clientX;
		lastT = event.timeStamp;

		event.preventDefault();
		const offset = Math.max(0, dx);
		if (driven) {
			driven.track(offset / window.innerWidth);
			return;
		}
		screen!.style.transform = `translateX(${offset}px)`;
		ghost?.track(offset / window.innerWidth);
	}

	function onPointerEnd(event: PointerEvent) {
		if (event.pointerId !== pointerId) return;
		if (!active) {
			pointerId = null;
			return;
		}

		const dx = Math.max(0, event.clientX - startX);
		const commit =
			dx > window.innerWidth * COMMIT_DISTANCE_RATIO ||
			velocity > COMMIT_VELOCITY;

		if (driven) {
			if (commit) driven.commit();
			else driven.cancel();
			reset();
			return;
		}

		pointerId = null;
		if (ghost) {
			if (commit) commitWithGhost();
			else cancelWithGhost();
			return;
		}

		screen!.style.transition =
			"transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";
		if (commit) navigateBack();
		// Whether we committed (content swapped) or cancelled, settle at 0.
		requestAnimationFrame(() => {
			screen!.style.transform = "translateX(0px)";
		});

		const cleanup = () => {
			screen!.removeEventListener("transitionend", cleanup);
			reset();
		};
		screen!.addEventListener("transitionend", cleanup);
		pointerId = null;
	}

	const opts = { passive: false } as const;
	window.addEventListener("pointerdown", onPointerDown, opts);
	window.addEventListener("pointermove", onPointerMove, opts);
	window.addEventListener("pointerup", onPointerEnd);
	window.addEventListener("pointercancel", onPointerEnd);

	return () => {
		window.removeEventListener("pointerdown", onPointerDown);
		window.removeEventListener("pointermove", onPointerMove);
		window.removeEventListener("pointerup", onPointerEnd);
		window.removeEventListener("pointercancel", onPointerEnd);
		reset();
	};
}
