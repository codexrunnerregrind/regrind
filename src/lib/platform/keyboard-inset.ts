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
 * iOS derives env(safe-area-inset-bottom) from the window, not from the webview
 * frame. When the software keyboard opens the frame is resized to sit above it,
 * but the home-indicator inset keeps being reported, so anything padded by
 * --safe-area-bottom floats a dead band above the keyboard. Zero the inset
 * while the viewport is visibly shorter than its resting height.
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
	const baseInset = root.style.getPropertyValue("--safe-area-bottom") || "0px";
	let resting = viewport.height;
	let open = false;

	const update = () => {
		// With nothing focused the viewport is at rest, so re-baseline. This is
		// what keeps a rotation from reading as a keyboard.
		if (!isEditable(document.activeElement)) resting = viewport.height;

		const next = resting - viewport.height > KEYBOARD_MIN_HEIGHT;
		if (next === open) return;
		open = next;
		root.style.setProperty("--safe-area-bottom", open ? "0px" : baseInset);
	};

	viewport.addEventListener("resize", update);
	document.addEventListener("focusin", update);
	document.addEventListener("focusout", update);

	return () => {
		viewport.removeEventListener("resize", update);
		document.removeEventListener("focusin", update);
		document.removeEventListener("focusout", update);
		root.style.setProperty("--safe-area-bottom", baseInset);
	};
}
