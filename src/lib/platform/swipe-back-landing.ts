import { tick } from "svelte";

import { TRANSPARENT_PIXEL } from "#lib/util/load-when-visible.ts";

// Past this the copy gives way whether or not the page is ready.
export const LANDING_CAP_MS = 300;

/**
 * A committed back swipe keeps the copy of the screen it went back to over the
 * real one until that has painted, so the landing never shows a blank image
 * or a profile scrolled to its top. Screens mounting under it can hold it up.
 */
export class SwipeLanding {
	readonly #holds = new Set<symbol>();
	#released: (() => void) | undefined;

	hold(): () => void {
		const hold = Symbol("swipe landing hold");
		this.#holds.add(hold);
		return () => {
			if (!this.#holds.delete(hold) || this.#holds.size > 0) return;
			this.#released?.();
		};
	}

	released(): Promise<void> {
		if (this.#holds.size === 0) return Promise.resolve();
		return new Promise((resolve) => {
			this.#released = resolve;
		});
	}
}

let current: SwipeLanding | null = null;

export function openSwipeLanding(): SwipeLanding {
	current = new SwipeLanding();
	return current;
}

export function closeSwipeLanding(landing: SwipeLanding): void {
	if (current === landing) current = null;
}

/** Holds a landing in progress until the returned release is called. */
export function holdSwipeLanding(): () => void {
	return current?.hold() ?? (() => {});
}

function inViewport(element: Element): boolean {
	const { top, right, bottom, left } = element.getBoundingClientRect();
	return bottom > 0 && right > 0 && top < innerHeight && left < innerWidth;
}

function imageShown(
	image: HTMLImageElement,
	signal: AbortSignal,
): Promise<void> {
	if (image.getAttribute("src") !== TRANSPARENT_PIXEL) return image.decode();
	// Lazy images start on a placeholder and get their source once in view.
	return new Promise((resolve) => {
		const observer = new MutationObserver(() => {
			if (image.getAttribute("src") === TRANSPARENT_PIXEL) return;
			observer.disconnect();
			resolve(image.decode());
		});
		observer.observe(image, { attributeFilter: ["src"] });
		signal.addEventListener(
			"abort",
			() => {
				observer.disconnect();
				resolve();
			},
			{ once: true },
		);
	});
}

export function imagesShown(
	root: HTMLElement,
	signal: AbortSignal,
): Promise<unknown> {
	const images = [...root.querySelectorAll("img")].filter(inViewport);
	return Promise.allSettled(images.map((image) => imageShown(image, signal)));
}

/** Resolves once `root` has landed, or after {@link LANDING_CAP_MS}. */
export async function landed({
	landing,
	root,
}: {
	landing: SwipeLanding;
	root: HTMLElement;
}): Promise<void> {
	const waiting = new AbortController();
	let capped: ReturnType<typeof setTimeout> | undefined;
	const cap = new Promise<void>((resolve) => {
		capped = setTimeout(resolve, LANDING_CAP_MS);
	});
	const ready = (async () => {
		await tick();
		await tick();
		await Promise.all([
			landing.released(),
			imagesShown(root, waiting.signal),
		]);
	})();
	await Promise.race([ready, cap]);
	clearTimeout(capped);
	waiting.abort();
}
