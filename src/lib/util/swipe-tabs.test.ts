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

	describe("inside a horizontal scroller", () => {
		function mountScroller({
			chain,
			scrollLeft,
		}: {
			chain: boolean;
			scrollLeft: number;
		}) {
			const outer = document.createElement("div");
			const scroller = document.createElement("div");
			const leaf = document.createElement("span");
			scroller.style.overflowX = "auto";
			if (chain) scroller.setAttribute("data-swipe-tabs-chain", "");
			Object.defineProperties(scroller, {
				scrollWidth: { value: 400 },
				clientWidth: { value: 100 },
				scrollLeft: { value: scrollLeft },
			});
			scroller.append(leaf);
			outer.append(scroller);
			document.body.append(outer);
			const onNext = vi.fn();
			const onPrev = vi.fn();
			swipeTabs(outer, { onNext, onPrev });
			return { leaf, onNext, onPrev };
		}

		it("leaves the swipe to an unmarked scroller", () => {
			const { leaf, onNext } = mountScroller({
				chain: false,
				scrollLeft: 300,
			});
			flick(leaf, -1);
			expect(onNext).not.toHaveBeenCalled();
		});

		it("takes a swipe past the end a marked scroller rests at", () => {
			const { leaf, onNext, onPrev } = mountScroller({
				chain: true,
				scrollLeft: 300,
			});
			flick(leaf, -1);
			flick(leaf, 1);
			expect(onNext).toHaveBeenCalledOnce();
			expect(onPrev).not.toHaveBeenCalled();
		});

		it("leaves a marked scroller the swipes it can still scroll", () => {
			const { leaf, onNext, onPrev } = mountScroller({
				chain: true,
				scrollLeft: 100,
			});
			flick(leaf, -1);
			flick(leaf, 1);
			expect(onNext).not.toHaveBeenCalled();
			expect(onPrev).not.toHaveBeenCalled();
		});

		/** A swipe the scroller takes over: a move or two, then a cancel. */
		function cancelledSwipe(
			target: Element,
			{ to, moves = [to] }: { to: number; moves?: number[] },
		) {
			window.dispatchEvent(touchEvent("touchstart", { x: 200, target }));
			for (const x of moves)
				window.dispatchEvent(touchEvent("touchmove", { x, target }));
			window.dispatchEvent(touchEvent("touchcancel", { x: to, target }));
		}

		it("takes a swipe past a marked scroller's end that iOS cancels", () => {
			const { leaf, onPrev } = mountScroller({
				chain: true,
				scrollLeft: 0,
			});
			cancelledSwipe(leaf, { to: 320 });
			expect(onPrev).toHaveBeenCalledOnce();
		});

		it("resolves the axis on cancel when the moves stopped early", () => {
			const { leaf, onPrev } = mountScroller({
				chain: true,
				scrollLeft: 0,
			});
			cancelledSwipe(leaf, { to: 320, moves: [204] });
			expect(onPrev).toHaveBeenCalledOnce();
		});

		it("drops a cancelled swipe too short to commit", () => {
			const { leaf, onPrev } = mountScroller({
				chain: true,
				scrollLeft: 0,
			});
			vi.spyOn(Event.prototype, "timeStamp", "get").mockReturnValue(0);
			cancelledSwipe(leaf, { to: 220 });
			expect(onPrev).not.toHaveBeenCalled();
		});

		it("drops a cancelled swipe that did not start in a marked scroller", () => {
			const outer = document.createElement("div");
			const leaf = document.createElement("span");
			outer.append(leaf);
			document.body.append(outer);
			const onPrev = vi.fn();
			swipeTabs(outer, { onPrev });
			cancelledSwipe(leaf, { to: 320 });
			expect(onPrev).not.toHaveBeenCalled();
		});
	});

	describe("inside the tabs' own pager", () => {
		function mountHost({ innerLeft }: { innerLeft: number | null }) {
			const host = document.createElement("div");
			host.setAttribute("data-swipe-tabs-host", "");
			host.style.overflowX = "auto";
			Object.defineProperties(host, {
				scrollWidth: { value: 500 },
				clientWidth: { value: 100 },
				scrollLeft: { value: 200 },
			});
			const leaf = document.createElement("span");
			if (innerLeft === null) host.append(leaf);
			else {
				const inner = document.createElement("div");
				inner.style.overflowX = "auto";
				inner.setAttribute("data-swipe-tabs-chain", "");
				Object.defineProperties(inner, {
					scrollWidth: { value: 400 },
					clientWidth: { value: 100 },
					scrollLeft: { value: innerLeft },
				});
				inner.append(leaf);
				host.append(inner);
			}
			document.body.append(host);
			const onNext = vi.fn();
			const onPrev = vi.fn();
			swipeTabs(host, { onNext, onPrev });
			return { leaf, onNext, onPrev };
		}

		it("leaves its own swipes to it", () => {
			const { leaf, onNext, onPrev } = mountHost({ innerLeft: null });
			flick(leaf, -1);
			flick(leaf, 1);
			expect(onNext).not.toHaveBeenCalled();
			expect(onPrev).not.toHaveBeenCalled();
		});

		it("takes a swipe an inner pager hands on past its end", () => {
			const { leaf, onNext, onPrev } = mountHost({ innerLeft: 300 });
			flick(leaf, -1);
			flick(leaf, 1);
			expect(onNext).toHaveBeenCalledOnce();
			expect(onPrev).not.toHaveBeenCalled();
		});
	});
});
