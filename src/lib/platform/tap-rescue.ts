import { TAP_SLOP_PX } from "#lib/platform/tap-quiet.ts";
import { LONG_PRESS_DURATION_MS } from "#lib/util/long-press.ts";

// iOS WebKit sometimes takes a clean tap without ever sending its click. A tap
// on a control that has had no click by then gets one dispatched for it.
export const RESCUE_AFTER_MS = 300;
// A click WebKit sends after a rescue belongs to the rescued tap.
const LATE_CLICK_MS = 800;
// A tap this soon after a scroll stops the glide, and is meant to click nothing.
const AFTER_SCROLL_MS = 120;

const CONTROL = [
	"a[href]",
	"button",
	"input",
	"select",
	"textarea",
	"label",
	"summary",
	"[contenteditable]:not([contenteditable='false'])",
	"[role='button']",
	"[role='link']",
	"[role='tab']",
	"[role='menuitem']",
	"[role='option']",
	"[role='checkbox']",
	"[role='switch']",
].join(", ");

const TEXT_INPUT_TYPES = new Set([
	"",
	"text",
	"search",
	"email",
	"url",
	"tel",
	"password",
	"number",
]);

function takesText(control: Element): control is HTMLElement {
	if (control instanceof HTMLTextAreaElement) return true;
	if (control instanceof HTMLInputElement)
		return TEXT_INPUT_TYPES.has(control.getAttribute("type") ?? "");
	return control instanceof HTMLElement && control.isContentEditable;
}

function disabled(control: Element): boolean {
	return (
		control.matches(":disabled") ||
		control.getAttribute("aria-disabled") === "true"
	);
}

const RESCUE_CLICKS = new WeakSet<Event>();

type Tap = {
	control: Element;
	x: number;
	y: number;
	startedAt: number;
	afterScroll: boolean;
	state: string;
	clicked: boolean;
};

// A control that acted on the press itself (a menu trigger opening on pointerup,
// say) has had its tap; a click on top would undo it.
function openState(control: Element): string {
	return `${control.getAttribute("aria-expanded")}|${control.getAttribute("data-state")}`;
}

export function installTapRescue({
	isNative = (event: Event) => event.isTrusted,
}: { isNative?: (event: Event) => boolean } = {}): () => void {
	let tap: Tap | null = null;
	let lastScroll: { scroller: Node; at: number } | null = null;
	let rescued: { control: Element; at: number } | null = null;

	const onScroll = (event: Event) => {
		const scroller =
			event.target instanceof Document
				? event.target.documentElement
				: event.target;
		if (scroller instanceof Node)
			lastScroll = { scroller, at: performance.now() };
	};

	// Only a glide in a scroller holding the control is stopped by the tap.
	const stopsGlide = (control: Element) =>
		lastScroll !== null &&
		performance.now() - lastScroll.at < AFTER_SCROLL_MS &&
		lastScroll.scroller.contains(control);

	const onPointerDown = (event: PointerEvent) => {
		tap = null;
		rescued = null;
		if (event.pointerType !== "touch" || !event.isPrimary) return;
		const target = event.target;
		const control =
			target instanceof Element ? target.closest(CONTROL) : null;
		if (!control || disabled(control)) return;
		tap = {
			control,
			x: event.clientX,
			y: event.clientY,
			startedAt: performance.now(),
			afterScroll: stopsGlide(control),
			state: openState(control),
			clicked: false,
		};
	};

	const onPointerMove = (event: PointerEvent) => {
		if (!tap) return;
		if (
			Math.hypot(event.clientX - tap.x, event.clientY - tap.y) >
			TAP_SLOP_PX
		)
			tap = null;
	};

	// A touch that turns into a scroll ends here, not in pointerup.
	const onPointerCancel = () => {
		tap = null;
	};

	const onPointerUp = (event: PointerEvent) => {
		const ended = tap;
		if (!ended || event.pointerType !== "touch") return;
		const endedAt = performance.now();
		if (endedAt - ended.startedAt > LONG_PRESS_DURATION_MS) {
			tap = null;
			return;
		}
		const { control } = ended;
		// That tap stopped a glide; it is not meant to do anything else.
		if (ended.afterScroll) {
			tap = null;
			return;
		}
		if (takesText(control)) {
			// Focus has to happen inside the touch for iOS to raise the keyboard.
			if (document.activeElement !== control) control.focus();
			tap = null;
			return;
		}
		// Frames, not a timer: WebKit holds a click until timers started by the
		// touch have run.
		const check = () => {
			if (tap !== ended || ended.clicked) return;
			if (performance.now() - endedAt < RESCUE_AFTER_MS) {
				requestAnimationFrame(check);
				return;
			}
			tap = null;
			if (!control.isConnected || disabled(control)) return;
			if (openState(control) !== ended.state) return;
			rescued = { control, at: performance.now() };
			const click = new MouseEvent("click", {
				bubbles: true,
				cancelable: true,
				// A tap's click; 0 reads as a keyboard click to some libraries.
				detail: 1,
				clientX: ended.x,
				clientY: ended.y,
			});
			RESCUE_CLICKS.add(click);
			control.dispatchEvent(click);
		};
		requestAnimationFrame(check);
	};

	const onClick = (event: MouseEvent) => {
		if (RESCUE_CLICKS.has(event)) return;
		if (tap) tap.clicked = true;
		// A click the rescue set off (a label's for its input, a replayed tap)
		// is not WebKit's late one.
		const late = rescued;
		if (!late || !isNative(event) || !(event.target instanceof Node))
			return;
		rescued = null;
		if (performance.now() - late.at > LATE_CLICK_MS) return;
		if (!late.control.contains(event.target)) return;
		event.preventDefault();
		event.stopImmediatePropagation();
	};

	const capture = { capture: true, passive: true } as const;
	const listeners = [
		["pointerdown", onPointerDown],
		["pointermove", onPointerMove],
		["pointercancel", onPointerCancel],
		["pointerup", onPointerUp],
	] as const;
	document.addEventListener("scroll", onScroll, capture);
	for (const [type, listener] of listeners)
		window.addEventListener(type, listener, capture);
	window.addEventListener("click", onClick, { capture: true });
	return () => {
		document.removeEventListener("scroll", onScroll, capture);
		for (const [type, listener] of listeners)
			window.removeEventListener(type, listener, capture);
		window.removeEventListener("click", onClick, { capture: true });
	};
}
