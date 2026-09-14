import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

vi.mock("$lib/platform/haptics", () => ({
	hapticImpact: vi.fn(),
	hapticNotification: vi.fn(),
}));

import { HoldGesture } from "./hold-gesture.svelte";

const HOLD_MS = 500;

let run: Mock<() => void>;
let enabled: boolean;

function gesture() {
	return new HoldGesture({ run, enabled: () => enabled });
}

beforeEach(() => {
	vi.useFakeTimers();
	run = vi.fn(() => {});
	enabled = true;
});

describe("HoldGesture", () => {
	it("leaves a short press to the click handler", () => {
		const hold = gesture();

		hold.start();
		vi.advanceTimersByTime(HOLD_MS - 50);
		hold.end();

		expect(run).not.toHaveBeenCalled();
		expect(hold.claimedClick()).toBe(false);
	});

	it("runs on release, not when the hold arms", () => {
		const hold = gesture();

		hold.start();
		vi.advanceTimersByTime(HOLD_MS);
		expect(run).not.toHaveBeenCalled();
		expect(hold.holding).toBe(true);

		hold.end();
		expect(run).toHaveBeenCalledTimes(1);
		expect(hold.holding).toBe(false);
	});

	it("swallows the click that follows a hold, but only that one", () => {
		const hold = gesture();

		hold.start();
		vi.advanceTimersByTime(HOLD_MS);
		hold.end();

		expect(hold.claimedClick()).toBe(true);
		expect(hold.claimedClick()).toBe(false);
	});

	// The click can go missing — a control disabled by `run` never dispatches
	// one — and a claim left standing would swallow the next real tap.
	it("drops a claim the click never collected", () => {
		const hold = gesture();

		hold.start();
		vi.advanceTimersByTime(HOLD_MS);
		hold.end();

		hold.start();
		hold.end();
		expect(hold.claimedClick()).toBe(false);
	});

	// Android's WebView long-press: a `contextmenu` at the same moment as the
	// timer would have armed, and the `pointerup` it ends the touch with.
	it("arms on the platform's own long-press", () => {
		const hold = gesture();

		hold.start();
		vi.advanceTimersByTime(HOLD_MS - 50);
		hold.press();
		expect(hold.holding).toBe(true);

		hold.end();
		expect(run).toHaveBeenCalledTimes(1);
		expect(hold.claimedClick()).toBe(true);
	});

	it("ignores a long-press on a control that has no hold action", () => {
		enabled = false;
		const hold = gesture();

		hold.start();
		hold.press();
		hold.end();

		expect(run).not.toHaveBeenCalled();
		expect(hold.holding).toBe(false);
	});

	// The gesture is over: a stray one must not arm a press that is not running.
	it("ignores a long-press after the press ended", () => {
		const hold = gesture();

		hold.start();
		hold.end();
		hold.press();

		expect(hold.holding).toBe(false);
		expect(run).not.toHaveBeenCalled();
	});

	it("stays a plain button while the hold action is unavailable", () => {
		enabled = false;
		const hold = gesture();

		hold.start();
		vi.advanceTimersByTime(HOLD_MS * 2);
		hold.end();

		expect(run).not.toHaveBeenCalled();
		expect(hold.claimedClick()).toBe(false);
	});

	it("drops a press that leaves the control", () => {
		const hold = gesture();

		hold.start();
		hold.cancel();
		vi.advanceTimersByTime(HOLD_MS * 2);
		hold.end();

		expect(run).not.toHaveBeenCalled();
		expect(hold.holding).toBe(false);
	});

	it("does not run after the control is gone", () => {
		const hold = gesture();

		hold.start();
		hold.dispose();
		vi.advanceTimersByTime(HOLD_MS * 2);

		expect(run).not.toHaveBeenCalled();
	});
});
