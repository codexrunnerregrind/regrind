import { cubicOut } from "svelte/easing";

/**
 * Smoothly scrolls the active screen's scroll container back to the top.
 *
 * The tabbed screens scroll inside a `.pull-scroller` (Browse, Right Now,
 * Interest) while the Inbox uses a bespoke list container marked with
 * `data-scroll-root`. Scrolling every match is safe: containers already at the
 * top are a no-op. Called when a bottom-nav tab that is already active is
 * tapped again.
 */
export function scrollActiveViewToTop() {
	const behavior: ScrollBehavior = "smooth";
	window.scrollTo({ top: 0, behavior });
	// In the tab shell only the pane on show; the others keep their place.
	const scope =
		document.querySelector("[data-tab-pane][data-active]") ?? document;
	for (const el of scope.querySelectorAll<HTMLElement>(
		".pull-scroller, [data-scroll-root]",
	)) {
		el.scrollTo({ top: 0, behavior });
	}
}

/**
 * Brings the message with this id into view, and blinks it so the jump is
 * visible in a wall of bubbles. Returns false when the message is not in the
 * DOM — an older message that pagination has not loaded yet — so the caller can
 * say so rather than look broken.
 */
export function scrollToMessage(messageId: string): boolean {
	const el = document.querySelector(
		`[data-message-id="${CSS.escape(messageId)}"]`,
	);
	if (!(el instanceof HTMLElement)) return false;
	el.scrollIntoView({ behavior: "smooth", block: "center" });
	el.animate([{ opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }], {
		duration: 700,
		easing: "ease-in-out",
	});
	return true;
}

export function hasScrollableOverflowY(el: Element): boolean {
	const { overflowY } = getComputedStyle(el);
	return overflowY === "auto" || overflowY === "scroll";
}

export function nearestScrollableAncestor(node: Element): Element | null {
	let el = node.parentElement;
	while (el) {
		if (hasScrollableOverflowY(el)) return el;
		el = el.parentElement;
	}
	return null;
}

/**
 * Brings a field the software keyboard has covered into view.
 *
 * WebKit reveals a field the tap itself focused, but focus that arrives any
 * other way — from its label, from a button — it leaves where it was, so the
 * keys come up over it. The keyboard's viewport resize lands after the focus,
 * so wait for it (or give up on a timer, since a keyboard already up never
 * sends one), then scroll only when the field really is under the keys.
 */
export function revealFieldUnderKeyboard(el: HTMLElement): void {
	const viewport = window.visualViewport;
	const settle = () => {
		clearTimeout(timer);
		viewport?.removeEventListener("resize", settle);
		const scroller = nearestScrollableAncestor(el);
		if (!(scroller instanceof HTMLElement)) return;
		const covered = viewport ? viewport.height : window.innerHeight;
		const field = el.getBoundingClientRect();
		if (field.bottom <= covered) return;
		// Centre it in what the keyboard leaves of the scroller, not in the
		// scroller: the scroller keeps its full height behind the keys.
		const box = scroller.getBoundingClientRect();
		const top = Math.max(box.top, 0);
		const visible = Math.min(box.bottom, covered) - top;
		scroller.scrollTo({
			top: Math.max(
				0,
				scroller.scrollTop +
					(field.top - top) -
					(visible - el.offsetHeight) / 2,
			),
			behavior: "smooth",
		});
	};
	const timer = setTimeout(settle, 400);
	viewport?.addEventListener("resize", settle);
}

export function glideScrollTop({
	element,
	durationMs,
	onLanded,
}: {
	element: HTMLElement;
	durationMs: number;
	onLanded: () => void;
}): () => void {
	const from = element.scrollTop;
	const start = performance.now();
	let frame = requestAnimationFrame(function step(now) {
		const progress = Math.min(1, Math.max(0, now - start) / durationMs);
		element.scrollTop = from * (1 - cubicOut(progress));
		if (progress < 1) frame = requestAnimationFrame(step);
		else onLanded();
	});
	return () => cancelAnimationFrame(frame);
}
