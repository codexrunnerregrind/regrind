import { goto } from "$app/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$lib/platform/haptics", () => ({ hapticSelection: vi.fn() }));

import { navTabs, swipeToNavTab } from "./nav-tabs";

const BROWSE = "/(protected)/(navbar)/(root)";
const RIGHT_NOW = "/(protected)/(navbar)/right-now";
const SETTINGS = "/(protected)/(navbar)/settings/(me)";

beforeEach(() => {
	vi.mocked(goto).mockClear();
});

describe("swipeToNavTab", () => {
	it("moves to the next tab", () => {
		expect(swipeToNavTab(BROWSE, 1)).toBe(true);
		expect(goto).toHaveBeenCalledWith("/right-now");
	});

	it("moves to the previous tab", () => {
		expect(swipeToNavTab(RIGHT_NOW, -1)).toBe(true);
		expect(goto).toHaveBeenCalledWith("/");
	});

	it("carries a swipe off Interest's last sub-tab on to Inbox", () => {
		expect(swipeToNavTab("/(protected)/(navbar)/interest/sent", 1)).toBe(
			true,
		);
		expect(goto).toHaveBeenCalledWith("/chat");
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

	it("keeps every tab's own screen swipeable", () => {
		// Interest is three sub-tabs and has no page of its own; the rest are
		// their route as the tab bar links to it.
		const roots = [
			BROWSE,
			RIGHT_NOW,
			"/(protected)/(navbar)/interest/views",
			"/(protected)/(navbar)/interest/taps",
			"/(protected)/(navbar)/interest/sent",
			"/(protected)/chat",
			SETTINGS,
		];
		for (const root of roots)
			expect(navTabs.some((tab) => tab.swipeRoot(root))).toBe(true);
	});
});
