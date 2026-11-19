import { describe, expect, it } from "vitest";

import { TAP_CLICK_WINDOW_MS, TAP_SLOP_PX, TapQuiet } from "./tap-quiet";

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
