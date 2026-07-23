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
