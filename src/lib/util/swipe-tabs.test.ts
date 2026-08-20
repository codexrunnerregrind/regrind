import { afterEach, describe, expect, it, vi } from "vitest";

import { swipeTabs } from "./swipe-tabs";

// jsdom has no Touch/TouchEvent, and the gesture only reads these fields.
function touchEvent(
	type: string,
	{ x, y = 100, target }: { x: number; y?: number; target: Element },
) {
	const touch = { identifier: 1, clientX: x, clientY: y };
	const list = type === "touchend" ? [] : [touch];
	const event = new Event(type, { bubbles: true }) as unknown as {
		touches: unknown;
		changedTouches: unknown;
	};
	Object.defineProperties(event, {
		touches: { value: list },
		changedTouches: { value: [touch] },
		target: { value: target },
	});
	return event as unknown as Event;
}

/** A flick: far enough and fast enough to commit in `direction`. */
function flick(target: Element, direction: -1 | 1) {
	const from = 200;
	const to = from + direction * 120;
	window.dispatchEvent(touchEvent("touchstart", { x: from, target }));
	window.dispatchEvent(touchEvent("touchmove", { x: to, target }));
	window.dispatchEvent(touchEvent("touchend", { x: to, target }));
}

/** Outer instance wrapping an inner one, both anchored on real elements. */
function mountNested() {
	const outer = document.createElement("div");
	const inner = document.createElement("div");
	const leaf = document.createElement("span");
	inner.append(leaf);
	outer.append(inner);
	document.body.append(outer);

	const calls: string[] = [];
	const innerNext = vi.fn(() => {
		calls.push("inner");
	});
	const outerNext = vi.fn(() => {
		calls.push("outer");
	});
	const outerAction = swipeTabs(outer, { onNext: outerNext });
	const innerAction = swipeTabs(inner, { onNext: innerNext });

	return { leaf, calls, innerNext, outerNext, outerAction, innerAction };
}

afterEach(() => {
	document.body.innerHTML = "";
	vi.restoreAllMocks();
});

describe("swipeTabs", () => {
	it("gives the swipe to the innermost instance", () => {
		const { leaf, calls, outerNext } = mountNested();
		flick(leaf, -1);
		expect(calls).toEqual(["inner"]);
		expect(outerNext).not.toHaveBeenCalled();
	});

	it("passes it outward when the inner one declines", () => {
		const outer = document.createElement("div");
		const inner = document.createElement("div");
		outer.append(inner);
		document.body.append(outer);
		const outerNext = vi.fn();
		swipeTabs(outer, { onNext: outerNext });
		swipeTabs(inner, { onNext: () => false });

		flick(inner, -1);
		expect(outerNext).toHaveBeenCalledOnce();
	});

	it("skips disabled instances", () => {
		const outer = document.createElement("div");
		const inner = document.createElement("div");
		outer.append(inner);
		document.body.append(outer);
		const innerNext = vi.fn();
		const outerNext = vi.fn();
		swipeTabs(outer, { onNext: outerNext });
		swipeTabs(inner, { onNext: innerNext, enabled: false });

		flick(inner, -1);
		expect(innerNext).not.toHaveBeenCalled();
		expect(outerNext).toHaveBeenCalledOnce();
	});

	it("ignores a swipe outside every instance", () => {
		const { outerNext, innerNext } = mountNested();
		const stray = document.createElement("div");
		document.body.append(stray);

		flick(stray, -1);
		expect(outerNext).not.toHaveBeenCalled();
		expect(innerNext).not.toHaveBeenCalled();
	});

	it("stops listening once the last instance is destroyed", () => {
		const { leaf, outerAction, innerAction, outerNext, innerNext } =
			mountNested();
		innerAction?.destroy?.();
		outerAction?.destroy?.();

		flick(leaf, -1);
		expect(outerNext).not.toHaveBeenCalled();
		expect(innerNext).not.toHaveBeenCalled();
	});
});
