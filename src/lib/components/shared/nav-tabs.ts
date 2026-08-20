import { goto } from "$app/navigation";
import ChatCircleIcon from "phosphor-svelte/lib/ChatCircleIcon";
import FireIcon from "phosphor-svelte/lib/FireIcon";
import LightningIcon from "phosphor-svelte/lib/LightningIcon";
import SquaresFourIcon from "phosphor-svelte/lib/SquaresFourIcon";
import UserIcon from "phosphor-svelte/lib/UserIcon";

import { hapticSelection } from "$lib/platform/haptics";

/**
 * The bottom bar's five tabs, in order.
 *
 * Shared rather than owned by the tab bar because the swipe gesture moves
 * between the same tabs in the same order, and two lists that had to agree
 * would eventually not.
 *
 * `match` decides which tab is lit: a route prefix rather than an exact id, so
 * subpages (a settings subpage, an interest sub-tab) keep their tab lit.
 * `swipeRoot` is narrower — only the tab's own top-level screen. A swipe on a
 * settings subpage or somebody's profile is not a request to leave the tab.
 */
export const navTabs = [
	{
		href: "/",
		label: "Browse",
		icon: SquaresFourIcon,
		match: (id: string) => id === "/(protected)/(navbar)/(root)",
		swipeRoot: (id: string) => id === "/(protected)/(navbar)/(root)",
	},
	{
		href: "/right-now",
		label: "Right Now",
		icon: LightningIcon,
		match: (id: string) => id === "/(protected)/(navbar)/right-now",
		swipeRoot: (id: string) => id === "/(protected)/(navbar)/right-now",
	},
	{
		href: "/interest",
		// The flame the rest of the app taps with (TapIcon, the profile
		// composer, the media viewer). A star meant nothing here — the tab is
		// where taps and views are read, so it wears the tap's own glyph.
		label: "Interest",
		icon: FireIcon,
		match: (id: string) => id.startsWith("/(protected)/(navbar)/interest"),
		swipeRoot: (id: string) =>
			id === "/(protected)/(navbar)/interest/views" ||
			id === "/(protected)/(navbar)/interest/taps",
	},
	{
		href: "/chat",
		label: "Inbox",
		icon: ChatCircleIcon,
		match: (id: string) => id.startsWith("/(protected)/chat"),
		// Not a conversation: in there a horizontal swipe belongs to the
		// message rows (swipe to reply) and to going back.
		swipeRoot: (id: string) => id === "/(protected)/chat",
	},
	{
		href: "/settings",
		label: "You",
		icon: UserIcon,
		match: (id: string) => id.startsWith("/(protected)/(navbar)/settings"),
		swipeRoot: (id: string) => id === "/(protected)/(navbar)/settings/(me)",
	},
];

/**
 * Which tab the route belongs to for the purposes of a swipe, or -1 when the
 * screen is not a tab's own — a subpage keeps its swipes to itself.
 */
export function swipeableTabIndex(routeId: string | null | undefined): number {
	return navTabs.findIndex((tab) => tab.swipeRoot(routeId ?? ""));
}

/**
 * Whether there is a tab `delta` along from wherever the route sits.
 *
 * Deliberately not wrapping: the tab bar is a row of five, and a flick off one
 * end landing at the other end is disorienting in a way a dead end is not. The
 * drag rubber-bands there instead.
 */
export function canSwipeToNavTab(
	routeId: string | null | undefined,
	delta: number,
): boolean {
	const index = swipeableTabIndex(routeId);
	return index !== -1 && navTabs[index + delta] !== undefined;
}

/**
 * Move `delta` tabs from wherever the route sits. Returns false — declining the
 * swipe, so anything wrapping this can have it — when there is no tab that way,
 * and otherwise the navigation, so the gesture can hold the incoming tab
 * off-screen until its content is there.
 */
export function swipeToNavTab(
	routeId: string | null | undefined,
	delta: number,
): false | Promise<void> {
	const index = swipeableTabIndex(routeId);
	if (index === -1) return false;
	const tab = navTabs[index + delta];
	if (!tab) return false;
	hapticSelection();
	return goto(tab.href);
}
