import { beforeEach, describe, expect, it, vi } from "vitest";

import { dragReorder } from "./drag-reorder";

vi.mock("$lib/platform/haptics", () => ({
	hapticImpact: () => {},
	hapticSelection: () => {},
}));

// jsdom has no PointerEvent and no pointer capture, and lays nothing out — so
// the events are synthesised and each tile is given a fixed box.
function pointer(type: string, init: { id?: number; x: number; y: number }) {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.assign(event, {
		pointerId: init.id ?? 1,
		clientX: init.x,
		clientY: init.y,
		button: 0,
	});
	return event as PointerEvent;
}

function grid(count: number) {
	const node = document.createElement("div");
	for (let i = 0; i < count; i++) {
		const tile = document.createElement("div");
		tile.setAttribute("data-reorder-item", "");
		tile.setPointerCapture = () => {};
		tile.releasePointerCapture = () => {};
		// A row of 100×100 tiles starting at the origin.
		tile.getBoundingClientRect = () =>
			({
				left: i * 100,
				right: i * 100 + 100,
				top: 0,
				bottom: 100,
			}) as DOMRect;
		node.append(tile);
	}
	document.body.append(node);
	return node;
}

describe("dragReorder", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
		vi.useFakeTimers();
	});

	it("reports the move once the tile is held, dragged and dropped", () => {
		const node = grid(3);
		const onReorder = vi.fn();
		dragReorder(node, { onReorder });

		node.children[0]?.dispatchEvent(
			pointer("pointerdown", { x: 50, y: 50 }),
		);
		vi.advanceTimersByTime(300);
		window.dispatchEvent(pointer("pointermove", { x: 250, y: 50 }));
		window.dispatchEvent(pointer("pointerup", { x: 250, y: 50 }));

		expect(onReorder).toHaveBeenCalledWith(0, 2);
	});

	it("leaves the order alone when the hold is too short", () => {
		const node = grid(3);
		const onReorder = vi.fn();
		dragReorder(node, { onReorder });

		node.children[0]?.dispatchEvent(
			pointer("pointerdown", { x: 50, y: 50 }),
		);
		vi.advanceTimersByTime(100);
		window.dispatchEvent(pointer("pointerup", { x: 50, y: 50 }));

		expect(onReorder).not.toHaveBeenCalled();
	});

	it("lets a scroll win when the finger moves before the tile lifts", () => {
		const node = grid(3);
		const onReorder = vi.fn();
		dragReorder(node, { onReorder });

		node.children[0]?.dispatchEvent(
			pointer("pointerdown", { x: 50, y: 50 }),
		);
		window.dispatchEvent(pointer("pointermove", { x: 50, y: 200 }));
		vi.advanceTimersByTime(300);
		window.dispatchEvent(pointer("pointermove", { x: 250, y: 50 }));
		window.dispatchEvent(pointer("pointerup", { x: 250, y: 50 }));

		expect(onReorder).not.toHaveBeenCalled();
	});
});
