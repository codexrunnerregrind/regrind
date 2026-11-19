export type ReadingAnchor = { message: HTMLElement; top: number };

export function readingAnchor(
	scroller: HTMLElement,
): ReadingAnchor | undefined {
	const viewTop = scroller.getBoundingClientRect().top;
	const message = Array.from(
		scroller.querySelectorAll<HTMLElement>('[data-slot="message"]'),
	).find((candidate) => candidate.getBoundingClientRect().bottom > viewTop);
	return message
		? { message, top: message.getBoundingClientRect().top }
		: undefined;
}

// The scroller opts out of native scroll anchoring, so this stands in for it.
export function holdReadingAnchor(
	scroller: HTMLElement,
	anchor: ReadingAnchor | undefined,
): void {
	if (!anchor?.message.isConnected) return;
	const shift = anchor.message.getBoundingClientRect().top - anchor.top;
	if (Math.abs(shift) >= 1)
		scroller.scrollBy({ top: shift, behavior: "instant" });
}

// Within half a screen of the oldest loaded message.
export function nearTop(scroller: HTMLElement): boolean {
	return scroller.scrollTop < scroller.clientHeight / 2;
}
