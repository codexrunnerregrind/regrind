import { beforeEach, describe, expect, it, vi } from "vitest";

import { longPressHandlers } from "./long-press";

// The handlers only read these three fields off a pointer event.
function pointer(x = 10, y = 10) {
	return { pointerType: "touch", clientX: x, clientY: y } as PointerEvent;
}

function mount(handlers: ReturnType<typeof longPressHandlers>) {
	const wrapper = document.createElement("div");
	const child = document.createElement("button");
	wrapper.append(child);
	document.body.append(wrapper);
	const capture = handlers.onclickcapture;
	if (capture) {
		wrapper.addEventListener("click", capture as EventListener, {
			capture: true,
		});
	}
	const onClick = vi.fn();
	child.addEventListener("click", onClick);

	const tap = (x = 10, y = 10) => {
		handlers.onpointerdown?.(pointer(x, y) as never);
		handlers.onpointerup?.(pointer(x, y) as never);
		child.dispatchEvent(
			new MouseEvent("click", {
				bubbles: true,
				cancelable: true,
				clientX: x,
				clientY: y,
			}),
		);
	};

	return { tap, onClick };
}

describe("longPressHandlers", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		document.body.innerHTML = "";
		// Clear the module-global press/click suppression windows between tests.
		vi.advanceTimersByTime(1000);
	});

	it("fires the tap action straight away when not deferring", () => {
		const { tap, onClick } = mount(
			longPressHandlers(vi.fn(), vi.fn(), { deferTapAction: false }),
		);
		tap();
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it("holds the tap action back until the double-tap window passes", () => {
		const { tap, onClick } = mount(
			longPressHandlers(vi.fn(), vi.fn(), { deferTapAction: true }),
		);
		tap();
		expect(onClick).not.toHaveBeenCalled();
		vi.advanceTimersByTime(299);
		expect(onClick).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it("reacts on a second tap instead of running the tap action", () => {
		const onDoubleTap = vi.fn();
		const { tap, onClick } = mount(
			longPressHandlers(vi.fn(), onDoubleTap, { deferTapAction: true }),
		);
		tap();
		vi.advanceTimersByTime(100);
		tap();
		expect(onDoubleTap).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(1000);
		expect(onClick).not.toHaveBeenCalled();
	});

	it("drops the deferred tap action when the press becomes a long-press", () => {
		const onLongPress = vi.fn();
		const handlers = longPressHandlers(onLongPress, vi.fn(), {
			deferTapAction: true,
		});
		const { onClick } = mount(handlers);
		handlers.onpointerdown?.(pointer() as never);
		vi.advanceTimersByTime(450);
		expect(onLongPress).toHaveBeenCalledTimes(1);
		handlers.onpointerup?.(pointer() as never);
		vi.advanceTimersByTime(1000);
		expect(onClick).not.toHaveBeenCalled();
	});
});
