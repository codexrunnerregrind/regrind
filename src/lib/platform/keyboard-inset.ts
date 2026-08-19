import { isTauri } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";

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
 * env(safe-area-inset-bottom) is derived from the window rather than the frame,
 * so the home-indicator inset keeps being reported with the keyboard up and
 * would float a dead band above the keys. Zero it while they are showing.
 *
 * Android reports IME insets natively through applyAndroidInsets, so this only
 * runs on iOS.
 */
export function applyKeyboardInset(): () => void {
	if (!isTauri() || platform() !== "ios") return () => {};

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

	const update = () => {
		// With nothing focused the viewport is at rest, so re-baseline. This is
		// what keeps a rotation from reading as a keyboard.
		if (!isEditable(document.activeElement)) resting = viewport.height;

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
		// The app is sized to the visible part now, so WebKit's caret reveal has
		// nothing left to reveal and only shifts the app off its own top.
		if (open && viewport.offsetTop !== 0) window.scrollTo(0, 0);
	};

	viewport.addEventListener("resize", update);
	viewport.addEventListener("scroll", update);
	document.addEventListener("focusin", update);
	document.addEventListener("focusout", update);
	update();

	return () => {
		viewport.removeEventListener("resize", update);
		viewport.removeEventListener("scroll", update);
		document.removeEventListener("focusin", update);
		document.removeEventListener("focusout", update);
		root.style.setProperty("--safe-area-bottom", baseInset);
		root.style.removeProperty("--viewport-height");
	};
}
