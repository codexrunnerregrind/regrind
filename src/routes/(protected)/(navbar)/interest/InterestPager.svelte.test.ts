import { cleanup, render } from "@testing-library/svelte";
import { page } from "$app/state";
import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedPathname } from "$app/types";

import InterestPager from "./InterestPager.svelte";

const VIEWS = "/interest/views";
const TAPS = "/interest/taps";
const MATCHES = "/interest/matches";
const REPLACE = { replaceState: true, noScroll: true };
const WIDTH = 400;

const { goto } = vi.hoisted(() => ({ goto: vi.fn() }));

vi.mock("$app/navigation", () => ({ goto }));
vi.mock("$app/state", async () => {
	const { SvelteURL } = await import("svelte/reactivity");
	return { page: { url: new SvelteURL("https://app.test/") } };
});
vi.mock("$lib/platform/haptics", () => ({ hapticSelection: vi.fn() }));
vi.mock("./views/ViewsGrid.svelte", () => ({ default: () => {} }));
vi.mock("./taps/TapsReceivedList.svelte", () => ({ default: () => {} }));
vi.mock("./matches/MatchesGrid.svelte", () => ({ default: () => {} }));
vi.mock("./sent/SentTapsList.svelte", () => ({ default: () => {} }));

function mountPager(pathname: ResolvedPathname, { active = true } = {}) {
	page.url.pathname = pathname;
	const { container } = render(InterestPager, {
		props: { ourProfileId: 1, active, headerHeight: 91 },
	});
	const pager = container.querySelector<HTMLElement>(
		'[data-slot="interest-pager"]',
	);
	if (!pager) throw new Error("interest pager not mounted");
	Object.defineProperty(pager, "clientWidth", { value: WIDTH });
	const track = pager.firstElementChild as HTMLElement;
	return { pager, track };
}

/** The tab the track rests on, from its transform. */
function restingOn(track: HTMLElement): number {
	const match = /calc\((-?\d+)% \+ (-?[\d.]+)px\)/.exec(
		track.style.transform,
	);
	if (!match) throw new Error(`no offset in ${track.style.transform}`);
	return Math.abs(Number(match[1]) / 100);
}

function drag(pager: HTMLElement, dx: number) {
	const target = pager.querySelector("[data-slot]") ?? pager;
	const at = (x: number) => ({ identifier: 1, clientX: x, clientY: 300 });
	const send = (type: string, x: number) => {
		const event = new Event(type, { bubbles: true, cancelable: true });
		Object.defineProperties(event, {
			touches: { value: type === "touchend" ? [] : [at(x)] },
			changedTouches: { value: [at(x)] },
		});
		target.dispatchEvent(event);
	};
	send("touchstart", 200);
	for (let step = 1; step <= 8; step += 1)
		send("touchmove", 200 + (dx * step) / 8);
	send("touchend", 200 + dx);
	flushSync();
}

describe("InterestPager", () => {
	afterEach(() => {
		cleanup();
		goto.mockReset();
	});

	it("rests on the routed tab without navigating", () => {
		const { track } = mountPager(TAPS);

		expect(restingOn(track)).toBe(1);
		expect(goto).not.toHaveBeenCalled();
	});

	it("goes to the neighbouring tab a swipe lets go towards, replacing the URL", () => {
		const { pager, track } = mountPager(TAPS);

		drag(pager, -200);

		expect(goto).toHaveBeenCalledExactlyOnceWith(MATCHES, REPLACE);
		expect(restingOn(track)).toBe(2);
	});

	it("moves one tab at most, however hard the flick", () => {
		const { pager, track } = mountPager(VIEWS);

		drag(pager, -390);

		expect(goto).toHaveBeenCalledExactlyOnceWith(TAPS, REPLACE);
		expect(restingOn(track)).toBe(1);
	});

	it("leaves a swipe past its first tab to the pager around it", () => {
		const { pager, track } = mountPager(VIEWS);

		expect(pager.hasAttribute("data-pan-first")).toBe(true);
		drag(pager, 200);

		expect(goto).not.toHaveBeenCalled();
		expect(restingOn(track)).toBe(0);
	});

	it("slides straight to a tab picked from the tabs", () => {
		const { track } = mountPager(VIEWS);

		page.url.pathname = "/interest/sent";
		flushSync();

		expect(restingOn(track)).toBe(3);
		expect(track.style.transition).not.toBe("none");
	});

	it("follows the remembered tab and takes no swipes while off-screen", () => {
		const { pager, track } = mountPager("/right-now", { active: false });

		expect(restingOn(track)).toBe(1);
		drag(pager, -200);

		expect(goto).not.toHaveBeenCalled();
	});
});
