import { afterEach, describe, expect, it } from "vitest";

import { rememberScreen, showSwipeBackGhost } from "./swipe-back-ghost";

function atIndex(index: number) {
	history.replaceState({ "sveltekit:history": index }, "");
}

function screenShowing(text: string): HTMLElement {
	const screen = document.createElement("div");
	screen.id = "screen-nav-root";
	screen.textContent = text;
	document.body.append(screen);
	return screen;
}

afterEach(() => {
	document.body.replaceChildren();
	history.replaceState(null, "");
});

describe("showSwipeBackGhost", () => {
	it("shows the screen that was left for this one beneath it", () => {
		const screen = screenShowing("profile");
		atIndex(4);
		rememberScreen(screen);
		screen.textContent = "chat";
		atIndex(5);

		const ghost = showSwipeBackGhost(screen);

		const host = document.querySelector('[data-slot="swipe-back-ghost"]');
		expect(ghost).not.toBeNull();
		expect(host?.textContent).toBe("profile");
		expect(host?.nextElementSibling).toBe(screen);
		expect(host?.querySelector("#screen-nav-root")).toBeNull();
	});

	it("has nothing to show without a snapshot of the entry behind", () => {
		const screen = screenShowing("grid");
		atIndex(7);

		expect(showSwipeBackGhost(screen)).toBeNull();
	});

	it("does not carry a drag's styles into the copy", () => {
		const screen = screenShowing("profile");
		screen.style.transform = "translateX(120px)";
		atIndex(1);
		rememberScreen(screen);
		atIndex(2);

		showSwipeBackGhost(screen);

		const copy = document.querySelector<HTMLElement>(
			'[data-slot="swipe-back-ghost"] > [data-slot="page-stack-ghost"]',
		);
		expect(copy?.style.transform).toBe("");
	});

	it("moves off the page once removed", () => {
		const screen = screenShowing("profile");
		atIndex(1);
		rememberScreen(screen);
		atIndex(2);

		showSwipeBackGhost(screen)?.remove();

		expect(
			document.querySelector('[data-slot="swipe-back-ghost"]'),
		).toBeNull();
	});

	it("keeps only the last few screens", () => {
		const screen = screenShowing("first");
		atIndex(1);
		rememberScreen(screen);
		for (const index of [2, 3, 4, 5]) {
			atIndex(index);
			rememberScreen(screen);
		}
		atIndex(2);

		expect(showSwipeBackGhost(screen)).toBeNull();
	});
});
