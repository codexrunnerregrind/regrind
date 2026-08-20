import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";

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
 */

// Width of the left-edge zone (px) where a drag may begin.
const EDGE_ZONE = 30;
// Horizontal travel (px) before the gesture is considered intentional.
const ACTIVATION_SLOP = 12;
// Fraction of the viewport width past which release commits a back nav.
const COMMIT_DISTANCE_RATIO = 0.35;
// Horizontal velocity (px/ms) that commits regardless of distance.
const COMMIT_VELOCITY = 0.4;

function runBackGestureHandlers(): boolean {
	const handlers = [...backGestureEventHandlers];
	for (let index = handlers.length - 1; index >= 0; index--) {
		if (handlers[index]?.() !== true) return true;
	}
	return false;
}

function canGoBack(): boolean {
	return window.navigation?.canGoBack ?? history.length > 1;
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

	function reset() {
		pointerId = null;
		active = false;
		screen!.style.transition = "";
		screen!.style.transform = "";
		screen!.style.willChange = "";
		screen!.style.boxShadow = "";
	}

	function onPointerDown(event: PointerEvent) {
		if (event.pointerType === "mouse") return;
		if (pointerId !== null) return;
		if (event.clientX > EDGE_ZONE) return;
		if (!canGoBack() && backGestureEventHandlers.size === 0) return;
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
			try {
				screen!.setPointerCapture(event.pointerId);
			} catch {
				// Pointer may already be released; capture is best-effort.
			}
			screen!.style.transition = "none";
			screen!.style.willChange = "transform";
			screen!.style.boxShadow = "-12px 0 24px rgba(0, 0, 0, 0.35)";
			// iOS draws a focused field's caret and selection in a native
			// overlay that neither the transform nor a layout offset carries
			// along, so a drag strands it as a dark bar across the composer —
			// and being native, no CSS on the field reaches it. Ending the
			// editing session is the only thing that clears it, which is also
			// what a back gesture does in most iOS apps. The cost is a
			// cancelled swipe coming back without the keyboard.
			const editing = document.activeElement;
			if (
				editing instanceof HTMLInputElement ||
				editing instanceof HTMLTextAreaElement ||
				(editing instanceof HTMLElement && editing.isContentEditable)
			)
				editing.blur();
		}

		const dt = event.timeStamp - lastT;
		if (dt > 0) velocity = (event.clientX - lastX) / dt;
		lastX = event.clientX;
		lastT = event.timeStamp;

		event.preventDefault();
		const offset = Math.max(0, dx);
		screen!.style.transform = `translateX(${offset}px)`;
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
