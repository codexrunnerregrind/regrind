import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TRANSPARENT_PIXEL } from "#lib/util/load-when-visible.ts";
import {
	closeSwipeLanding,
	holdSwipeLanding,
	landed,
	LANDING_CAP_MS,
	openSwipeLanding,
} from "./swipe-back-landing";

function rootWith(...images: HTMLImageElement[]): HTMLElement {
	const root = document.createElement("div");
	root.append(...images);
	document.body.append(root);
	return root;
}

function shownImage(src: string): HTMLImageElement {
	const image = document.createElement("img");
	image.setAttribute("src", src);
	vi.spyOn(image, "getBoundingClientRect").mockReturnValue({
		top: 10,
		left: 10,
		right: 100,
		bottom: 100,
	} as DOMRect);
	return image;
}

function settledWithin(promise: Promise<void>) {
	let done = false;
	void promise.then(() => (done = true));
	return () => done;
}

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
	vi.useRealTimers();
	document.body.replaceChildren();
});

describe("holdSwipeLanding", () => {
	it("holds nothing outside a landing", () => {
		expect(() => holdSwipeLanding()()).not.toThrow();
	});

	it("waits for every hold to be released", async () => {
		const landing = openSwipeLanding();
		const first = holdSwipeLanding();
		const second = holdSwipeLanding();
		const done = settledWithin(landed({ landing, root: rootWith() }));

		first();
		await vi.advanceTimersByTimeAsync(10);
		expect(done()).toBe(false);

		second();
		await vi.advanceTimersByTimeAsync(10);
		expect(done()).toBe(true);
		closeSwipeLanding(landing);
	});

	it("stops holding a closed landing", async () => {
		const landing = openSwipeLanding();
		closeSwipeLanding(landing);
		holdSwipeLanding();
		await expect(landing.released()).resolves.toBeUndefined();
	});
});

describe("landed", () => {
	it("waits for an image in view to decode", async () => {
		let decoded!: () => void;
		const image = shownImage("/a.jpg");
		image.decode = () => new Promise((resolve) => (decoded = resolve));
		const landing = openSwipeLanding();
		const done = settledWithin(landed({ landing, root: rootWith(image) }));

		await vi.advanceTimersByTimeAsync(10);
		expect(done()).toBe(false);

		decoded();
		await vi.advanceTimersByTimeAsync(0);
		expect(done()).toBe(true);
		closeSwipeLanding(landing);
	});

	it("waits for a lazy image to get its source", async () => {
		const image = shownImage(TRANSPARENT_PIXEL);
		image.decode = () => Promise.resolve();
		const landing = openSwipeLanding();
		const done = settledWithin(landed({ landing, root: rootWith(image) }));

		await vi.advanceTimersByTimeAsync(10);
		expect(done()).toBe(false);

		image.setAttribute("src", "/a.jpg");
		await vi.advanceTimersByTimeAsync(0);
		expect(done()).toBe(true);
		closeSwipeLanding(landing);
	});

	it("gives up after the cap", async () => {
		const image = shownImage("/a.jpg");
		image.decode = () => new Promise(() => {});
		const landing = openSwipeLanding();
		holdSwipeLanding();
		const done = settledWithin(landed({ landing, root: rootWith(image) }));

		await vi.advanceTimersByTimeAsync(LANDING_CAP_MS - 1);
		expect(done()).toBe(false);

		await vi.advanceTimersByTimeAsync(1);
		expect(done()).toBe(true);
		closeSwipeLanding(landing);
	});
});
