import { afterEach, describe, expect, it } from "vitest";

import { installSidewaysWheel } from "./sideways-wheel.ts";

function row(scrollWidth: number, clientWidth: number): HTMLElement {
	const el = document.createElement("div");
	el.dataset.scrollIntent = "x";
	Object.defineProperty(el, "scrollWidth", { value: scrollWidth });
	Object.defineProperty(el, "clientWidth", { value: clientWidth });
	const chip = document.createElement("button");
	el.append(chip);
	document.body.append(el);
	return el;
}

function wheel(target: Element, deltaY: number, deltaX = 0): WheelEvent {
	const event = new WheelEvent("wheel", {
		deltaY,
		deltaX,
		bubbles: true,
		cancelable: true,
	});
	target.dispatchEvent(event);
	return event;
}

describe("installSidewaysWheel", () => {
	let release = () => {};
	afterEach(() => {
		release();
		document.body.replaceChildren();
	});

	it("turns a vertical wheel over a sideways row into a sideways scroll", () => {
		release = installSidewaysWheel();
		const el = row(500, 200);
		const event = wheel(el.firstElementChild!, 120);
		expect(el.scrollLeft).toBe(120);
		expect(event.defaultPrevented).toBe(true);
	});

	it("lets the page scroll once the row is at its end", () => {
		release = installSidewaysWheel();
		const el = row(500, 200);
		const event = wheel(el, -50);
		expect(el.scrollLeft).toBe(0);
		expect(event.defaultPrevented).toBe(false);
	});

	it("leaves horizontal gestures and other elements alone", () => {
		release = installSidewaysWheel();
		const el = row(500, 200);
		expect(wheel(el, 10, 40).defaultPrevented).toBe(false);
		const other = document.createElement("div");
		document.body.append(other);
		expect(wheel(other, 120).defaultPrevented).toBe(false);
	});
});
