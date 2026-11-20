// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pointerEvent } from "#lib/test/pointer.ts";
import { installTapRescue, RESCUE_AFTER_MS } from "./tap-rescue";

function pointer(
	target: Element,
	type: string,
	{ x = 10, pointerType = "touch" } = {},
) {
	target.dispatchEvent(pointerEvent(type, { pointerType, x }));
}

function tap(target: Element) {
	pointer(target, "pointerdown");
	pointer(target, "pointerup");
}

function webkitClick(target: Element) {
	target.dispatchEvent(
		new MouseEvent("click", { bubbles: true, cancelable: true }),
	);
}

let release: () => void;
let button: HTMLButtonElement;
let clicks: number;

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] });
	release = installTapRescue();
	button = document.createElement("button");
	button.innerHTML = "<span>Go</span>";
	document.body.append(button);
	clicks = 0;
	button.addEventListener("click", () => clicks++);
});

afterEach(() => {
	release();
	document.body.replaceChildren();
	vi.useRealTimers();
});

describe("installTapRescue", () => {
	it("clicks a control whose tap WebKit never clicked", async () => {
		tap(button.firstElementChild!);
		await vi.advanceTimersByTimeAsync(RESCUE_AFTER_MS - 20);
		expect(clicks).toBe(0);

		await vi.advanceTimersByTimeAsync(40);
		expect(clicks).toBe(1);
	});

	it("leaves a tap WebKit clicked alone", async () => {
		tap(button);
		webkitClick(button);
		await vi.advanceTimersByTimeAsync(RESCUE_AFTER_MS * 2);
		expect(clicks).toBe(1);
	});

	it("drops WebKit's click when it comes after a rescue", async () => {
		tap(button);
		await vi.advanceTimersByTimeAsync(RESCUE_AFTER_MS + 20);
		webkitClick(button);
		expect(clicks).toBe(1);
	});

	it("focuses a text field inside the touch", () => {
		const field = document.createElement("textarea");
		document.body.append(field);
		tap(field);
		expect(document.activeElement).toBe(field);
	});

	it("ignores what is not a control", async () => {
		const text = document.createElement("p");
		document.body.append(text);
		let textClicks = 0;
		text.addEventListener("click", () => textClicks++);
		tap(text);
		await vi.advanceTimersByTimeAsync(RESCUE_AFTER_MS * 2);
		expect(textClicks).toBe(0);
	});

	it("ignores a drag, a scroll, a hold, a mouse and a tap that stops a glide", async () => {
		pointer(button, "pointerdown");
		pointer(button, "pointermove", { x: 30 });
		pointer(button, "pointerup", { x: 30 });

		pointer(button, "pointerdown");
		pointer(button, "pointercancel");

		pointer(button, "pointerdown");
		await vi.advanceTimersByTimeAsync(600);
		pointer(button, "pointerup");

		pointer(button, "pointerdown", { pointerType: "mouse" });
		pointer(button, "pointerup", { pointerType: "mouse" });

		document.dispatchEvent(new Event("scroll"));
		tap(button);

		await vi.advanceTimersByTimeAsync(RESCUE_AFTER_MS * 2);
		expect(clicks).toBe(0);
	});

	it("focuses a text field even when the tap stops a glide", () => {
		const field = document.createElement("textarea");
		document.body.append(field);
		document.dispatchEvent(new Event("scroll"));
		tap(field);
		expect(document.activeElement).toBe(field);
	});

	it("sends a tap's click, not a keyboard one", async () => {
		let detail = -1;
		button.addEventListener("click", (event) => (detail = event.detail));
		tap(button);
		await vi.advanceTimersByTimeAsync(RESCUE_AFTER_MS + 20);
		expect(detail).toBe(1);
	});

	it("leaves a control that acted on the press itself", async () => {
		button.setAttribute("aria-expanded", "false");
		pointer(button, "pointerdown");
		button.setAttribute("aria-expanded", "true");
		pointer(button, "pointerup");
		await vi.advanceTimersByTimeAsync(RESCUE_AFTER_MS * 2);
		expect(clicks).toBe(0);
	});

	it("skips a disabled control", async () => {
		button.disabled = true;
		tap(button);
		await vi.advanceTimersByTimeAsync(RESCUE_AFTER_MS * 2);
		expect(clicks).toBe(0);
	});
});
