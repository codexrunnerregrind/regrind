import type { HTMLAttributes } from "svelte/elements";

const LONG_PRESS_DURATION_MS = 450;
const LONG_PRESS_MOVE_TOLERANCE_PX = 12;
// iOS WebKit does not reliably fire `dblclick` for touch, so we synthesize a
// double-tap from two quick taps landing close together.
const DOUBLE_TAP_MAX_GAP_MS = 300;
const DOUBLE_TAP_MOVE_TOLERANCE_PX = 24;
// A layout shift can land the contextmenu or the click on another element.
const NATIVE_CONTEXTMENU_DELAY_MS = 500;
const CLICK_SUPPRESS_MS = 700;

let lastFiredAt = 0;
let suppressClickUntil = 0;
let clickSuppressorAttached = false;

function fireOnce(onLongPress: () => void): void {
	const now = Date.now();
	if (now - lastFiredAt < NATIVE_CONTEXTMENU_DELAY_MS) return;
	lastFiredAt = now;
	onLongPress();
}

function onGlobalClickCapture(event: MouseEvent): void {
	if (suppressClickUntil === 0) return;
	if (Date.now() > suppressClickUntil) {
		suppressClickUntil = 0;
		return;
	}
	suppressClickUntil = 0;
	event.preventDefault();
	event.stopPropagation();
}

function suppressNextClick(): void {
	suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
	if (clickSuppressorAttached || typeof document === "undefined") return;
	clickSuppressorAttached = true;
	document.addEventListener("click", onGlobalClickCapture, { capture: true });
}

type LongPressHandlers = Pick<
	HTMLAttributes<HTMLElement>,
	| "onpointerdown"
	| "onpointermove"
	| "onpointerup"
	| "onpointercancel"
	| "oncontextmenu"
	| "onclickcapture"
>;

// Marks a click we dispatched ourselves so the capture handler lets it through.
const REPLAYED_CLICKS = new WeakSet<Event>();

export function longPressHandlers(
	onLongPress: () => void,
	onDoubleTap?: () => void,
	// Media messages open a lightbox on the first tap, which swallows the second
	// one — so their tap action waits out the double-tap window before it runs.
	options?: { deferTapAction?: boolean },
): LongPressHandlers {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let originX = 0;
	let originY = 0;
	let pressConsumed = false;
	let lastTapAt = 0;
	let lastTapX = 0;
	let lastTapY = 0;
	let awaitingSecondTap = false;
	let replayTimer: ReturnType<typeof setTimeout> | null = null;

	const deferring = () => Boolean(options?.deferTapAction && onDoubleTap);

	const cancelReplay = () => {
		awaitingSecondTap = false;
		if (replayTimer !== null) {
			clearTimeout(replayTimer);
			replayTimer = null;
		}
	};

	const cancel = () => {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	};

	return {
		onpointerdown(event) {
			pressConsumed = false;
			cancel();
			if (event.pointerType === "mouse") return;
			originX = event.clientX;
			originY = event.clientY;
			timer = setTimeout(() => {
				timer = null;
				pressConsumed = true;
				cancelReplay();
				fireOnce(onLongPress);
			}, LONG_PRESS_DURATION_MS);
		},
		onpointermove(event) {
			if (timer === null) return;
			if (
				Math.abs(event.clientX - originX) >
					LONG_PRESS_MOVE_TOLERANCE_PX ||
				Math.abs(event.clientY - originY) > LONG_PRESS_MOVE_TOLERANCE_PX
			) {
				cancel();
			}
		},
		onpointerup(event) {
			cancel();
			if (event.pointerType === "mouse") return;
			if (pressConsumed) {
				suppressNextClick();
				cancelReplay();
				lastTapAt = 0;
				return;
			}
			// Synthesize a double-tap: a second clean tap shortly after the first,
			// landing near it, that did not move far enough to be a long-press cancel.
			if (
				onDoubleTap &&
				Date.now() - lastTapAt < DOUBLE_TAP_MAX_GAP_MS &&
				Math.abs(event.clientX - lastTapX) <
					DOUBLE_TAP_MOVE_TOLERANCE_PX &&
				Math.abs(event.clientY - lastTapY) <
					DOUBLE_TAP_MOVE_TOLERANCE_PX
			) {
				lastTapAt = 0;
				cancelReplay();
				suppressNextClick();
				onDoubleTap();
				return;
			}
			lastTapAt = Date.now();
			lastTapX = event.clientX;
			lastTapY = event.clientY;
			if (deferring()) awaitingSecondTap = true;
		},
		onclickcapture(event) {
			if (!awaitingSecondTap || REPLAYED_CLICKS.has(event)) return;
			// Hold the tap action back: if a second tap lands inside the window this
			// was half of a double-tap, otherwise the click is replayed as-is.
			awaitingSecondTap = false;
			const target = event.target;
			const { clientX, clientY } = event;
			event.preventDefault();
			event.stopPropagation();
			if (!(target instanceof Element)) return;
			if (replayTimer !== null) clearTimeout(replayTimer);
			replayTimer = setTimeout(() => {
				replayTimer = null;
				const replay = new MouseEvent("click", {
					bubbles: true,
					cancelable: true,
					composed: true,
					clientX,
					clientY,
				});
				REPLAYED_CLICKS.add(replay);
				target.dispatchEvent(replay);
			}, DOUBLE_TAP_MAX_GAP_MS);
		},
		onpointercancel() {
			cancel();
			cancelReplay();
		},
		oncontextmenu(event) {
			event.preventDefault();
			cancel();
			if (!pressConsumed) {
				pressConsumed = true;
				fireOnce(onLongPress);
			}
		},
	};
}
