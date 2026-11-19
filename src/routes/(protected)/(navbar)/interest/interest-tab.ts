/**
 * Which of Interest's sub-tabs to land on when the tab bar sends you to
 * `/interest` with no sub-path.
 *
 * The tab bar links to `/interest`, so without this every visit would reset to
 * the same sub-tab and lose where you were — the other four tabs all keep their
 * place. Module state rather than a preference: it should survive navigating
 * around the app, not a restart.
 */

export const interestTabs = [
	"/interest/views",
	"/interest/taps",
	"/interest/matches",
	"/interest/sent",
] as const;

export type InterestTab = (typeof interestTabs)[number];

let lastTab: InterestTab = "/interest/taps";

export function getInterestTab(): InterestTab {
	return lastTab;
}

export function rememberInterestTab(pathname: string): void {
	const match = interestTabs.find((tab) => tab === pathname);
	if (match) lastTab = match;
}

export const MATCHES_TAB: InterestTab = "/interest/matches";

/** Matches is hidden unless the account has any: the feature is not offered everywhere. */
export function shownInterestTabs(
	showMatches: boolean,
): readonly InterestTab[] {
	return showMatches
		? interestTabs
		: interestTabs.filter((tab) => tab !== MATCHES_TAB);
}

export function interestTabIndex(
	pathname: string,
	tabs: readonly InterestTab[] = interestTabs,
): number {
	return Math.max(
		0,
		tabs.findIndex((tab) => tab === pathname),
	);
}
