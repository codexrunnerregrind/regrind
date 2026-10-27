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
	"/interest/sent",
	"/interest/matches",
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
