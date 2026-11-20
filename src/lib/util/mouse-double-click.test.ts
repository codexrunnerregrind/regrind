// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ ios: false }));
vi.mock("#lib/platform/os.ts", () => ({ isIosPlatform: () => platform.ios }));

import { mouseDoubleClick } from "./mouse-double-click";

function doubleClick(node: HTMLElement, touch = false) {
	const event = new MouseEvent("dblclick", { bubbles: true });
	if (touch)
		Object.defineProperty(event, "sourceCapabilities", {
			value: { firesTouchEvents: true },
		});
	node.dispatchEvent(event);
}

afterEach(() => {
	platform.ios = false;
	document.body.replaceChildren();
});

describe("mouseDoubleClick", () => {
	it("hears a mouse double-click and ignores a touch one", () => {
		const node = document.createElement("div");
		const handler = vi.fn();
		mouseDoubleClick(handler)(node);

		doubleClick(node);
		doubleClick(node, true);

		expect(handler).toHaveBeenCalledOnce();
	});

	it("listens for nothing on iOS", () => {
		platform.ios = true;
		const node = document.createElement("div");
		const handler = vi.fn();
		mouseDoubleClick(handler)(node);

		doubleClick(node);

		expect(handler).not.toHaveBeenCalled();
	});
});
