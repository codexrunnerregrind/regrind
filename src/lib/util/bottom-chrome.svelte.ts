import { SvelteMap } from "svelte/reactivity";
import type { Attachment } from "svelte/attachments";

const clearances = new SvelteMap<HTMLElement, number>();

function measureClearance(element: HTMLElement): void {
	if (element.inert || element.getClientRects().length === 0) {
		clearances.delete(element);
		return;
	}
	const contentTop =
		element.getBoundingClientRect().top +
		parseFloat(getComputedStyle(element).paddingTop);
	clearances.set(element, window.innerHeight - contentTop);
}

export function bottomChromeClearance(): number {
	return Math.max(0, ...clearances.values());
}

export function remeasureBottomChrome(): void {
	for (const element of clearances.keys()) measureClearance(element);
}

export const bottomChrome: Attachment<HTMLElement> = (element) => {
	const measure = () => measureClearance(element);
	const movesWithItsScroller =
		getComputedStyle(element).position === "sticky";
	const observer = new ResizeObserver(measure);
	observer.observe(element);
	window.addEventListener("resize", measure);
	element.addEventListener("introend", measure);
	element.addEventListener("outrostart", measure);
	if (movesWithItsScroller)
		window.addEventListener("scroll", measure, {
			capture: true,
			passive: true,
		});
	return () => {
		observer.disconnect();
		window.removeEventListener("resize", measure);
		element.removeEventListener("introend", measure);
		element.removeEventListener("outrostart", measure);
		window.removeEventListener("scroll", measure, { capture: true });
		clearances.delete(element);
	};
};
