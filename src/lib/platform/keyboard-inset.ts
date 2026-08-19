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
 * iOS handles the software keyboard in two ways that both need help.
 *
 * The frame may be resized to sit above the keyboard, in which case dvh already
 * excludes it — but env(safe-area-inset-bottom) is derived from the window, not
 * the frame, so the home-indicator inset keeps being reported and anything
 * padded by --safe-area-bottom floats a dead band above the keys.
 *
 * The frame may equally be left at full height, with WebKit scrolling the
 * caret into view instead. That reveal is unreliable — it is the reason a first
 * tap sometimes leaves the composer behind the keyboard while the next one,
 * after dismissing it, lands fine. Rather than depend on it, publish how far
 * the keyboard overlaps the *layout* viewport as --keyboard-inset so screens
 * can shorten themselves and keep the field on screen unaided. When the frame
 * did resize the overlap is zero, so the two paths can't both pay for the
 * keyboard.
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
	let inset = 0;

	const update = () => {
		// With nothing focused the viewport is at rest, so re-baseline. This is
		// what keeps a rotation from reading as a keyboard.
		if (!isEditable(document.activeElement)) resting = viewport.height;

		// How much of the layout viewport the keyboard covers. offsetTop is
		// WebKit's own caret reveal, which shifts the visual viewport without
		// the keyboard having grown.
		const overlap = Math.max(
			0,
			window.innerHeight - viewport.height - viewport.offsetTop,
		);
		const nextInset =
			overlap > KEYBOARD_MIN_HEIGHT ? Math.round(overlap) : 0;
		// Either signal means a keyboard: the overlap when the frame kept its
		// height, the shrink against resting when it was resized instead.
		const nextOpen =
			nextInset > 0 || resting - viewport.height > KEYBOARD_MIN_HEIGHT;

		if (nextInset !== inset) {
			inset = nextInset;
			root.style.setProperty("--keyboard-inset", `${inset}px`);
		}
		if (nextOpen !== open) {
			open = nextOpen;
			root.style.setProperty(
				"--safe-area-bottom",
				open ? "0px" : baseInset,
			);
			// The screen now ends above the keyboard on its own, so undo any
			// reveal WebKit scrolled in before we got here.
			if (open) window.scrollTo(0, 0);
		}
	};

	viewport.addEventListener("resize", update);
	viewport.addEventListener("scroll", update);
	document.addEventListener("focusin", update);
	document.addEventListener("focusout", update);

	return () => {
		viewport.removeEventListener("resize", update);
		viewport.removeEventListener("scroll", update);
		document.removeEventListener("focusin", update);
		document.removeEventListener("focusout", update);
		root.style.setProperty("--safe-area-bottom", baseInset);
		root.style.setProperty("--keyboard-inset", "0px");
	};
}
