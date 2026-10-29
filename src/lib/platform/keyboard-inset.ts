import { isIosPlatform } from "$lib/platform/os";

/** A keyboard is at least this tall; smaller shrinks are chrome, not an IME. */
const KEYBOARD_MIN_HEIGHT = 100;

function isEditable(element: Element | null): boolean {
	if (!(element instanceof HTMLElement)) return false;
	if (element.isContentEditable) return true;
	return element.tagName === "INPUT" || element.tagName === "TEXTAREA";
}

/**
 * Sizes the app to the part of the window the software keyboard leaves over,
 * and keeps env(safe-area-inset-bottom) out of that gap.
 *
 * iOS does not have one story about the keyboard. Raise it by tapping the field
 * and the webview frame keeps its height while the visual viewport shrinks
 * under it; raise it from a gesture that focuses the field for you and the frame
 * itself is resized, window.innerHeight following it down. Anything derived from
 * innerHeight therefore reads the keyboard on one path and misses it on the
 * other, which is exactly how the composer ended up behind the keys.
 *
 * visualViewport.height is the one measurement that reports the same height
 * either way, so publish it as --viewport-height and let screens use it in place
 * of 100dvh. offsetTop is WebKit scrolling the caret into view; the layout no
 * longer needs that reveal, so it is scrolled back rather than compensated for.
 *
 * A fixed element pinned to the bottom is pinned to the *layout* viewport,
 * which the tap path leaves at full height — so a bottom sheet stays under the
 * keys however short the app is sized. --keyboard-height is what the keyboard
 * covers of that layout viewport, for those elements to sit on. On the path
 * where the frame is resized instead there is nothing left to clear and it
 * stays 0.
 *
 * env(safe-area-inset-bottom) is derived from the window rather than the frame,
 * so the home-indicator inset keeps being reported with the keyboard up and
 * would float a dead band above the keys. Zero it while they are showing.
 *
 * Android reports IME insets natively through applyAndroidInsets, so this only
 * runs on iOS.
 */
export function applyKeyboardInset(): () => void {
	if (!isIosPlatform()) return () => {};

	const viewport = window.visualViewport;
	if (!viewport) return () => {};

	const root = document.documentElement;
	// Captured as written by applyAndroidInsets — on iOS that's the env()
	// expression rather than a resolved length, so it still tracks rotation.
	const baseInset =
		root.style.getPropertyValue("--safe-area-bottom") || "0px";
	let resting = viewport.height;
	let open = false;
	let height = 0;
	let keyboard = 0;

	const update = () => {
		// With nothing focused the viewport is at rest, so re-baseline — this is
		// what keeps a rotation from reading as a keyboard. Upwards only: a
		// dialog closing hands the focus back through the body, and adopting
		// that height would read as "no keyboard" while the keys are still up.
		// Anything that genuinely shortens the window rebaselines below.
		if (!isEditable(document.activeElement))
			resting = Math.max(resting, viewport.height);

		const nextHeight = Math.round(viewport.height);
		if (nextHeight !== height) {
			height = nextHeight;
			root.style.setProperty("--viewport-height", `${height}px`);
		}

		const nextOpen = resting - viewport.height > KEYBOARD_MIN_HEIGHT;
		if (nextOpen !== open) {
			open = nextOpen;
			root.style.setProperty(
				"--safe-area-bottom",
				open ? "0px" : baseInset,
			);
		}

		const nextKeyboard = open
			? Math.max(
					0,
					Math.round(
						window.innerHeight -
							viewport.height -
							viewport.offsetTop,
					),
				)
			: 0;
		if (nextKeyboard !== keyboard) {
			keyboard = nextKeyboard;
			root.style.setProperty("--keyboard-height", `${keyboard}px`);
		}
		// The app is sized to the visible part now, so WebKit's caret reveal has
		// nothing left to reveal and only shifts the app off its own top.
		if (viewport.offsetTop !== 0) window.scrollTo(0, 0);
	};

	// The window is only ever resized by something that really is a smaller
	// window — a rotation, split view — so that is where the baseline may drop.
	const rebaseline = () => {
		if (!isEditable(document.activeElement)) resting = viewport.height;
		update();
	};

	// An overlay's scroll lock can hold a pan through the focus change that
	// closes it: overflow: hidden makes the reset a no-op, so try again once
	// the lock is gone.
	const updateAfterFocus = () => {
		update();
		requestAnimationFrame(update);
	};

	viewport.addEventListener("resize", update);
	viewport.addEventListener("scroll", update);
	window.addEventListener("resize", rebaseline);
	window.addEventListener("orientationchange", rebaseline);
	document.addEventListener("focusin", updateAfterFocus);
	document.addEventListener("focusout", updateAfterFocus);
	update();

	return () => {
		viewport.removeEventListener("resize", update);
		viewport.removeEventListener("scroll", update);
		window.removeEventListener("resize", rebaseline);
		window.removeEventListener("orientationchange", rebaseline);
		document.removeEventListener("focusin", updateAfterFocus);
		document.removeEventListener("focusout", updateAfterFocus);
		root.style.setProperty("--safe-area-bottom", baseInset);
		root.style.removeProperty("--viewport-height");
		root.style.removeProperty("--keyboard-height");
	};
}

/**
 * Reports how far the keyboard covers the bottom of `element`, measured
 * against the visual viewport so it holds on every iOS keyboard path and stays
 * 0 where the webview is resized around the keys.
 */
export function trackKeyboardOverlap(
	element: HTMLElement | undefined,
	onChange: (overlap: number) => void,
): () => void {
	const viewport = window.visualViewport;
	if (!viewport || !element) return () => {};

	const measure = () => {
		const bottom = element.getBoundingClientRect().bottom;
		onChange(
			Math.max(
				0,
				Math.round(bottom - viewport.offsetTop - viewport.height),
			),
		);
	};
	const measureAfterFocus = () => {
		measure();
		requestAnimationFrame(measure);
	};

	viewport.addEventListener("resize", measure);
	viewport.addEventListener("scroll", measure);
	window.addEventListener("resize", measure);
	document.addEventListener("focusin", measureAfterFocus);
	document.addEventListener("focusout", measureAfterFocus);
	measure();

	return () => {
		viewport.removeEventListener("resize", measure);
		viewport.removeEventListener("scroll", measure);
		window.removeEventListener("resize", measure);
		document.removeEventListener("focusin", measureAfterFocus);
		document.removeEventListener("focusout", measureAfterFocus);
	};
}
