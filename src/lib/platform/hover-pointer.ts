export const HOVER_POINTER_ROOT_ATTRIBUTE = "data-hover-pointer";

// iOS follows a tap with buttonless moves of its own. Taking them for a hovering
// pointer turns hover styles on mid-tap, and WebKit then withholds the click.
export const TAP_ECHO_MS = 1000;

export function trackHoverPointer(): () => void {
	const root = document.documentElement;
	root.toggleAttribute(
		HOVER_POINTER_ROOT_ATTRIBUTE,
		matchMedia("(hover: hover)").matches,
	);
	let lastTouch = Number.NEGATIVE_INFINITY;
	const listening = new AbortController();
	const options = { capture: true, passive: true, signal: listening.signal };
	window.addEventListener(
		"pointermove",
		(event) => {
			if (!event.isTrusted || event.buttons !== 0) return;
			if (event.pointerType === "touch") return;
			if (event.timeStamp - lastTouch < TAP_ECHO_MS) return;
			root.toggleAttribute(HOVER_POINTER_ROOT_ATTRIBUTE, true);
		},
		options,
	);
	const noteTouch = (event: PointerEvent) => {
		if (!event.isTrusted || event.pointerType !== "touch") return;
		lastTouch = event.timeStamp;
		if (event.type === "pointerdown")
			root.toggleAttribute(HOVER_POINTER_ROOT_ATTRIBUTE, false);
	};
	window.addEventListener("pointerdown", noteTouch, options);
	window.addEventListener("pointerup", noteTouch, options);
	return () => {
		listening.abort();
		root.removeAttribute(HOVER_POINTER_ROOT_ATTRIBUTE);
	};
}
