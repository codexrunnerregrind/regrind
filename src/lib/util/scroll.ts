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
	for (const el of document.querySelectorAll<HTMLElement>(
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
