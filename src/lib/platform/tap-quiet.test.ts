import { afterEach, describe, expect, it, vi } from "vitest";

import {
	TAP_CLICK_WINDOW_MS,
	TAP_SLOP_PX,
	tapPending,
	TapQuiet,
	whenTapQuiet,
} from "./tap-quiet";

function touch(type: string, at = { clientX: 10, clientY: 10 }) {
	const event = new Event(type);
	Object.defineProperty(event, "touches", {
		value: type === "touchend" ? [] : [at],
	});
	window.dispatchEvent(event);
}

describe("TapQuiet", () => {
	it("is quiet with no finger down", () => {
		expect(new TapQuiet().pending(0)).toBe(false);
	});

	it("holds from the touch until the click window after the lift", () => {
		const quiet = new TapQuiet();
		quiet.touchStart({ x: 10, y: 10, touches: 1 });
		expect(quiet.pending(0)).toBe(true);

		quiet.touchEnd({ at: 100 });
		expect(quiet.pending(100 + TAP_CLICK_WINDOW_MS - 1)).toBe(true);
		expect(quiet.pending(100 + TAP_CLICK_WINDOW_MS)).toBe(false);
	});

	it("lets go once the finger moves far enough to scroll", () => {
		const quiet = new TapQuiet();
		quiet.touchStart({ x: 10, y: 10, touches: 1 });
		quiet.touchMove({ x: 10, y: 10 + TAP_SLOP_PX });
		expect(quiet.pending(0)).toBe(true);

		quiet.touchMove({ x: 10, y: 11 + TAP_SLOP_PX });
		expect(quiet.pending(0)).toBe(false);
		quiet.touchEnd({ at: 100 });
		expect(quiet.pending(100)).toBe(false);
	});

	it("ignores a second finger and a cancelled touch", () => {
		const quiet = new TapQuiet();
		quiet.touchStart({ x: 10, y: 10, touches: 2 });
		expect(quiet.pending(0)).toBe(false);

		quiet.touchStart({ x: 10, y: 10, touches: 1 });
		quiet.touchCancel();
		expect(quiet.pending(0)).toBe(false);
	});
});

describe("whenTapQuiet", () => {
	afterEach(() => vi.useRealTimers());

	it("resolves once the tap's click window has passed", async () => {
		vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] });
		tapPending();
		touch("touchstart");
		touch("touchend");
		let quiet = false;
		void whenTapQuiet().then(() => (quiet = true));

		await vi.advanceTimersByTimeAsync(TAP_CLICK_WINDOW_MS - 20);
		expect(quiet).toBe(false);

		await vi.advanceTimersByTimeAsync(40);
		expect(quiet).toBe(true);
	});

	it("resolves at once with no tap", async () => {
		await expect(whenTapQuiet()).resolves.toBeUndefined();
	});
});
