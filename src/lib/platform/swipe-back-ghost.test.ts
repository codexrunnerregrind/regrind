import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setLocale, SOURCE_LOCALE } from "#lib/i18n/index.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import {
	forgetScreens,
	registerGhostFixup,
	rememberScreen,
	showSwipeBackGhost,
} from "./swipe-back-ghost";

function atIndex(index: number, path?: string) {
	history.replaceState({ "sveltekit:history": index }, "", path);
}

function screenShowing(text: string): HTMLElement {
	const screen = document.createElement("div");
	screen.id = "screen-nav-root";
	screen.textContent = text;
	document.body.append(screen);
	return screen;
}

beforeEach(() => runningOn("ios"));

afterEach(async () => {
	resetPlatform();
	document.body.replaceChildren();
	history.replaceState(null, "", "/");
	await setLocale({ locale: SOURCE_LOCALE });
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

	it("forgets the copies of a path whose content changed", () => {
		const screen = screenShowing("profile 9");
		atIndex(101, "/profile/9");
		rememberScreen(screen);
		atIndex(102, "/settings/profile");

		forgetScreens("/profile/9");

		expect(showSwipeBackGhost(screen)).toBeNull();
	});

	it("keeps the copies of other paths", () => {
		const screen = screenShowing("profile 8");
		atIndex(111, "/profile/8");
		rememberScreen(screen);
		atIndex(112, "/settings/profile");

		forgetScreens("/profile/9");

		expect(showSwipeBackGhost(screen)).not.toBeNull();
	});

	it("shows no copy taken in another language", async () => {
		const screen = screenShowing("settings");
		atIndex(121);
		rememberScreen(screen);
		atIndex(122);

		await setLocale({ locale: "en-XA" });

		expect(showSwipeBackGhost(screen)).toBeNull();
	});

	it("lets the screen's path adjust its copy before it shows", () => {
		const screen = screenShowing("grid");
		atIndex(131, "/fixup-test");
		rememberScreen(screen);
		atIndex(132, "/profile/1");
		registerGhostFixup("/fixup-test", (ghost) => {
			ghost.textContent = "grid, revealed";
		});

		showSwipeBackGhost(screen);

		expect(
			document.querySelector('[data-slot="swipe-back-ghost"]')
				?.textContent,
		).toBe("grid, revealed");
	});

	it("rises over the page for the landing", () => {
		const screen = screenShowing("profile");
		atIndex(141);
		rememberScreen(screen);
		atIndex(142);

		showSwipeBackGhost(screen)?.raise();

		const host = document.querySelector<HTMLElement>(
			'[data-slot="swipe-back-ghost"]',
		);
		expect(Number(host?.style.zIndex)).toBeGreaterThan(0);
	});
});
