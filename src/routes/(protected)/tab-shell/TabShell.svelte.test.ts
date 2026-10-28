import { cleanup, render } from "@testing-library/svelte";
import { page } from "$app/state";
import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RouteId } from "$app/types";

import TabShell from "./TabShell.svelte";

const ROUTES = {
	browse: "/(protected)/(navbar)/(root)",
	rightNow: "/(protected)/(navbar)/right-now",
	taps: "/(protected)/(navbar)/interest/taps",
	inbox: "/(protected)/chat",
	conversation: "/(protected)/chat/[conversationId]",
	you: "/(protected)/(navbar)/settings/(me)",
} satisfies Record<string, RouteId>;

const { goto, afterNavigate, navigating } = vi.hoisted(() => ({
	goto: vi.fn(),
	afterNavigate: vi.fn<(callback: () => void) => void>(),
	navigating: { type: null, to: null as { url: URL } | null },
}));

vi.mock("$app/navigation", () => ({ goto, afterNavigate }));
vi.mock("$app/state", async () => {
	const { SvelteMap } = await import("svelte/reactivity");
	const route = new SvelteMap<"id", string | null>([["id", ""]]);
	return {
		navigating,
		page: {
			url: new URL("https://app.test/"),
			route: {
				get id() {
					return route.get("id") ?? null;
				},
				set id(id: string | null) {
					route.set("id", id);
				},
			},
		},
	};
});
vi.mock("$lib/components/shared/NavBar.svelte", () => ({ default: () => {} }));
vi.mock("../(navbar)/(root)/BrowseScreen.svelte", () => ({
	default: () => {},
}));
vi.mock("../(navbar)/right-now/RightNowScreen.svelte", () => ({
	default: () => {},
}));
vi.mock("../(navbar)/interest/InterestScreen.svelte", () => ({
	default: () => {},
}));
vi.mock("../chat/InboxScreen.svelte", () => ({ default: () => {} }));
vi.mock("../(navbar)/settings/(me)/YouScreen.svelte", () => ({
	default: () => {},
}));

const WIDTH = 400;

function mountShell(routeId: RouteId) {
	page.route.id = routeId;
	const { container } = render(TabShell, { props: { ourProfileId: 1 } });
	const pager = container.querySelector<HTMLElement>(
		'[data-slot="tab-shell-pager"]',
	);
	const track = container.querySelector<HTMLElement>(
		'[data-slot="tab-shell-track"]',
	);
	if (!pager || !track) throw new Error("tab shell not mounted");
	Object.defineProperty(pager, "clientWidth", { value: WIDTH });
	return { pager, track, panes: [...track.children] as HTMLElement[] };
}

/** Where the track sits: the pane it rests on, and how far the finger has it. */
function position(track: HTMLElement) {
	const match = /calc\((-?\d+)% \+ (-?[\d.]+)px\)/.exec(
		track.style.transform,
	);
	if (!match) throw new Error(`no track offset in ${track.style.transform}`);
	return { pane: -Number(match[1]) / 100, dragPx: Number(match[2]) };
}

/** A horizontal drag over the first pane, in moves of a few pixels. */
function drag(
	pager: HTMLElement,
	{ dx, release = true }: { dx: number; release?: boolean },
) {
	const target = pager.firstElementChild ?? pager;
	const at = (x: number) => ({ identifier: 1, clientX: x, clientY: 300 });
	const send = (type: string, x: number) => {
		const event = new Event(type, { bubbles: true, cancelable: true });
		Object.defineProperties(event, {
			touches: { value: type === "touchend" ? [] : [at(x)] },
			changedTouches: { value: [at(x)] },
		});
		target.dispatchEvent(event);
	};
	const from = 200;
	send("touchstart", from);
	for (let step = 1; step <= 8; step += 1)
		send("touchmove", from + (dx * step) / 8);
	if (release) send("touchend", from + dx);
	flushSync();
}

function route(routeId: RouteId) {
	page.route.id = routeId;
	flushSync();
}

describe("TabShell", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		goto.mockReset();
		afterNavigate.mockReset();
	});

	it("opens on the routed tab without navigating or sliding", () => {
		const { track } = mountShell(ROUTES.rightNow);

		expect(position(track)).toEqual({ pane: 1, dragPx: 0 });
		expect(track.style.transition).toBe("none");
		expect(goto).not.toHaveBeenCalled();
	});

	it("marks only the routed pane active, and leaves only it reachable", () => {
		const { panes } = mountShell(ROUTES.inbox);
		flushSync();

		expect(panes.map((pane) => pane.hasAttribute("data-active"))).toEqual([
			false,
			false,
			false,
			true,
			false,
		]);
		expect(panes.map((pane) => pane.inert)).toEqual([
			true,
			true,
			true,
			false,
			true,
		]);
	});

	it("follows the finger while it is down", () => {
		const { pager, track } = mountShell(ROUTES.rightNow);

		drag(pager, { dx: -120, release: false });

		expect(position(track)).toEqual({ pane: 1, dragPx: -120 });
		expect(goto).not.toHaveBeenCalled();
	});

	it("goes to the tab a drag is let go past the threshold for", () => {
		const { pager, track } = mountShell(ROUTES.browse);

		drag(pager, { dx: -200 });

		expect(goto).toHaveBeenCalledExactlyOnceWith("/right-now", {
			noScroll: true,
		});
		expect(position(track)).toEqual({ pane: 1, dragPx: 0 });
		expect(track.style.transition).not.toBe("none");
	});

	it("goes straight to Interest's remembered sub-tab", () => {
		const { pager } = mountShell(ROUTES.rightNow);

		drag(pager, { dx: -200 });

		expect(goto).toHaveBeenCalledExactlyOnceWith("/interest/taps", {
			noScroll: true,
		});
	});

	it("springs back from a short, slow drag", () => {
		const { pager, track } = mountShell(ROUTES.rightNow);
		vi.spyOn(Event.prototype, "timeStamp", "get").mockReturnValue(0);

		drag(pager, { dx: -40 });

		expect(goto).not.toHaveBeenCalled();
		expect(position(track)).toEqual({ pane: 1, dragPx: 0 });
	});

	it("gives only a little past the first tab, and goes nowhere", () => {
		const { pager, track } = mountShell(ROUTES.browse);

		drag(pager, { dx: 200, release: false });
		expect(position(track).dragPx).toBeCloseTo(200 * 0.35, 5);

		drag(pager, { dx: 0 });
		expect(goto).not.toHaveBeenCalled();
	});

	it("never navigates while a conversation covers it", () => {
		const { pager } = mountShell(ROUTES.conversation);

		drag(pager, { dx: -200 });

		expect(goto).not.toHaveBeenCalled();
	});

	it("slides to a tab picked from the bar", () => {
		const { track } = mountShell(ROUTES.browse);

		route(ROUTES.you);

		expect(position(track)).toEqual({ pane: 4, dragPx: 0 });
		expect(track.style.transition).not.toBe("none");
	});
});
