import { afterEach, describe, expect, it, vi } from "vitest";

import { swipeTabs } from "./swipe-tabs";

// jsdom has no Touch/TouchEvent, and the gesture only reads these fields.
function touchEvent(
	type: string,
	{ x, y = 100, target }: { x: number; y?: number; target: Element },
) {
	const touch = { identifier: 1, clientX: x, clientY: y };
	const list = type === "touchend" ? [] : [touch];
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperties(event, {
		touches: { value: list },
		changedTouches: { value: [touch] },
		target: { value: target },
	});
	return event;
}

const START = 300;

function down(target: Element) {
	window.dispatchEvent(touchEvent("touchstart", { x: START, target }));
}

function move(target: Element, dx: number) {
	window.dispatchEvent(touchEvent("touchmove", { x: START + dx, target }));
}

function up(target: Element, dx: number) {
	window.dispatchEvent(touchEvent("touchend", { x: START + dx, target }));
}

/** A drag that commits: jsdom reports no clientWidth, so the fallback is the
 *  1024px window and the threshold is 20% of it. */
function drag(target: Element, dx: number) {
	down(target);
	move(target, dx);
	up(target, dx);
}

/** Every instance this file mounted, so each test starts from nothing. */
const mounted: ReturnType<typeof swipeTabs>[] = [];

function attach(node: HTMLElement, opts: Parameters<typeof swipeTabs>[1]) {
	const action = swipeTabs(node, opts);
	mounted.push(action);
	return action;
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A drag slow enough not to read as a flick: the release velocity is averaged
 * over a 120ms window, so the steps have to be further apart than that.
 */
async function slowDrag(target: Element, dx: number) {
	down(target);
	for (let step = 1; step <= 3; step++) {
		move(target, (dx * step) / 3);
		await sleep(140);
	}
	up(target, dx);
}

/** Long enough for the out/in animations, which fall back to timers here. */
function settled() {
	return new Promise((resolve) => setTimeout(resolve, 700));
}

function offset(node: HTMLElement): number {
	const match = /translate3d\((-?[\d.]+)px/.exec(node.style.transform);
	return match ? Number(match[1]) : 0;
}

/** Outer instance wrapping an inner one, both anchored on real elements. */
function mountNested(inner: Partial<Parameters<typeof swipeTabs>[1]> = {}) {
	const outer = document.createElement("div");
	const innerNode = document.createElement("div");
	const leaf = document.createElement("span");
	innerNode.append(leaf);
	outer.append(innerNode);
	document.body.append(outer);

	const calls: string[] = [];
	const innerNext = vi.fn(() => {
		calls.push("inner");
	});
	const outerNext = vi.fn(() => {
		calls.push("outer");
	});
	const outerAction = attach(outer, {
		canNext: () => true,
		canPrev: () => true,
		onNext: outerNext,
	});
	const innerAction = attach(innerNode, {
		canNext: () => true,
		canPrev: () => true,
		onNext: innerNext,
		...inner,
	});

	return {
		outer,
		innerNode,
		leaf,
		calls,
		innerNext,
		outerNext,
		outerAction,
		innerAction,
	};
}

afterEach(async () => {
	// A test that only inspects the drag leaves a finger down; the module tracks
	// one gesture for every instance, so it has to be lifted before the next.
	window.dispatchEvent(new Event("touchcancel"));
	for (const action of mounted.splice(0)) action?.destroy?.();
	document.body.innerHTML = "";
	vi.restoreAllMocks();
	await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("swipeTabs", () => {
	it("drags the outer shell, not the instance that claims the swipe", () => {
		const { leaf, outer, innerNode } = mountNested();
		down(leaf);
		move(leaf, -60);

		expect(offset(outer)).toBe(-60);
		expect(innerNode.style.transform).toBe("");
	});

	it("rubber-bands against a dead end", () => {
		const outer = document.createElement("div");
		document.body.append(outer);
		// The first tab: somewhere to go forward, nothing behind it.
		attach(outer, {
			canNext: () => true,
			canPrev: () => false,
			onPrev: vi.fn(),
		});

		down(outer);
		move(outer, 100);
		// Some give, but nowhere near the finger.
		expect(offset(outer)).toBeGreaterThan(0);
		expect(offset(outer)).toBeLessThan(40);
	});

	it("stays put on a screen that is not in the pager", () => {
		const outer = document.createElement("div");
		document.body.append(outer);
		attach(outer, { onNext: vi.fn() });

		down(outer);
		move(outer, -300);
		expect(offset(outer)).toBe(0);
	});

	it("gives a committed swipe to the innermost instance", async () => {
		const { leaf, calls, outerNext } = mountNested();
		drag(leaf, -300);
		await settled();

		expect(calls).toEqual(["inner"]);
		expect(outerNext).not.toHaveBeenCalled();
	});

	it("passes it outward when the inner one declines", async () => {
		const { leaf, outerNext } = mountNested({ onNext: () => false });
		drag(leaf, -300);
		await settled();

		expect(outerNext).toHaveBeenCalledOnce();
	});

	it("waits for the navigation before bringing the new tab in", async () => {
		let resolveNav: () => void = () => {};
		const navigation = new Promise<void>((resolve) => {
			resolveNav = resolve;
		});
		const outer = document.createElement("div");
		document.body.append(outer);
		attach(outer, { canNext: () => true, onNext: () => navigation });

		drag(outer, -300);
		await settled();
		// Held off-screen for as long as the navigation takes.
		expect(offset(outer)).toBeLessThan(-500);

		resolveNav();
		await settled();
		expect(outer.style.transform).toBe("");
	});

	it("springs back from a drag that stops short", async () => {
		const { leaf, outer, innerNext } = mountNested();
		await slowDrag(leaf, -60);
		await settled();

		expect(innerNext).not.toHaveBeenCalled();
		expect(outer.style.transform).toBe("");
	});

	it("ignores a swipe outside every instance", async () => {
		const { outerNext, innerNext } = mountNested();
		const stray = document.createElement("div");
		document.body.append(stray);

		drag(stray, -300);
		await settled();
		expect(outerNext).not.toHaveBeenCalled();
		expect(innerNext).not.toHaveBeenCalled();
	});

	it("skips disabled instances", async () => {
		const { leaf, innerNext, outerNext, innerAction } = mountNested();
		innerAction?.update?.({
			enabled: false,
			canNext: () => true,
			onNext: innerNext,
		});

		drag(leaf, -300);
		await settled();
		expect(innerNext).not.toHaveBeenCalled();
		expect(outerNext).toHaveBeenCalledOnce();
	});

	it("stops listening once the last instance is destroyed", async () => {
		const { leaf, outerAction, innerAction, outerNext, innerNext } =
			mountNested();
		innerAction?.destroy?.();
		outerAction?.destroy?.();

		drag(leaf, -300);
		await settled();
		expect(outerNext).not.toHaveBeenCalled();
		expect(innerNext).not.toHaveBeenCalled();
	});
});
