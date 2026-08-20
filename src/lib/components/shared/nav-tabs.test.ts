import { goto } from "$app/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$lib/platform/haptics", () => ({ hapticSelection: vi.fn() }));

import { canSwipeToNavTab, navTabs, swipeToNavTab } from "./nav-tabs";

const BROWSE = "/(protected)/(navbar)/(root)";
const RIGHT_NOW = "/(protected)/(navbar)/right-now";
const SETTINGS = "/(protected)/(navbar)/settings/(me)";

beforeEach(() => {
	vi.mocked(goto).mockClear();
});

describe("swipeToNavTab", () => {
	it("moves to the next tab", () => {
		expect(swipeToNavTab(BROWSE, 1)).not.toBe(false);
		expect(goto).toHaveBeenCalledWith("/right-now");
	});

	it("moves to the previous tab", () => {
		expect(swipeToNavTab(RIGHT_NOW, -1)).not.toBe(false);
		expect(goto).toHaveBeenCalledWith("/");
	});

	it("hands back the navigation, so the tab can be held off-screen", () => {
		vi.mocked(goto).mockReturnValueOnce(Promise.resolve());
		expect(swipeToNavTab(BROWSE, 1)).toBeInstanceOf(Promise);
	});

	it("declines at either end rather than wrapping", () => {
		expect(swipeToNavTab(BROWSE, -1)).toBe(false);
		expect(swipeToNavTab(SETTINGS, 1)).toBe(false);
		expect(goto).not.toHaveBeenCalled();
	});

	it("declines on a subpage of a tab", () => {
		expect(
			swipeToNavTab("/(protected)/(navbar)/settings/(subpage)/app", 1),
		).toBe(false);
		expect(swipeToNavTab("/(protected)/chat/[conversationId]", 1)).toBe(
			false,
		);
		expect(
			swipeToNavTab("/(protected)/(navbar)/profile/[profileId]", -1),
		).toBe(false);
		expect(goto).not.toHaveBeenCalled();
	});

	it("answers the same question ahead of the gesture", () => {
		// What the drag asks before it decides whether to follow the finger.
		expect(canSwipeToNavTab(BROWSE, 1)).toBe(true);
		expect(canSwipeToNavTab(BROWSE, -1)).toBe(false);
		expect(canSwipeToNavTab(SETTINGS, 1)).toBe(false);
		expect(canSwipeToNavTab(SETTINGS, -1)).toBe(true);
		expect(
			canSwipeToNavTab("/(protected)/(navbar)/profile/[profileId]", 1),
		).toBe(false);
		expect(goto).not.toHaveBeenCalled();
	});

	it("keeps every tab's own screen swipeable", () => {
		// Interest is two sub-tabs and has no page of its own; the rest are
		// their route as the tab bar links to it.
		const roots = [
			BROWSE,
			RIGHT_NOW,
			"/(protected)/(navbar)/interest/views",
			"/(protected)/(navbar)/interest/taps",
			"/(protected)/chat",
			SETTINGS,
		];
		for (const root of roots)
			expect(navTabs.some((tab) => tab.swipeRoot(root))).toBe(true);
	});
});
