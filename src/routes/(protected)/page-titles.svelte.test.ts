// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ version: "test" }));
vi.mock(
	import("#lib/app-data/preferences.svelte.ts"),
	async (importOriginal) => ({
		...(await importOriginal()),
		hydratePreferences: () => new Promise(() => {}),
		preferencesAccount: () => null,
	}),
);
// the fork's screens render in the tab shell; only the routes' titles matter
vi.mock("#lib/components/tab-shell/tab-shell-state.svelte.ts", () => ({
	tabShellShowing: () => true,
}));
vi.mock("#lib/grid/grid-state.svelte.ts", () => ({
	gridState: { onStartOver: () => () => {} },
}));
vi.mock("#lib/util/scroll-restore.svelte.ts", () => ({
	restoreScrollOnce: () => {},
}));

import { PSEUDO_TITLE } from "#lib/i18n/fixtures/pseudo-message.ts";
import { setLocale, SOURCE_LOCALE } from "#lib/i18n/index.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import BrowsePage from "./(navbar)/(root)/+page.svelte";
import RightNowPage from "./(navbar)/right-now/+page.svelte";

const pages = [
	{ route: "/", title: "Browse", open: () => render(BrowsePage) },
	{
		route: "/right-now",
		title: "Right Now",
		open: () => render(RightNowPage),
	},
];

beforeEach(() => runningOn("windows"));

afterEach(async () => {
	cleanup();
	resetPlatform();
	document.title = "";
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("page titles", () => {
	it.each(pages)(
		"$route replaces the previous page's title with $title in the active locale",
		async ({ title, open }) => {
			document.title = "Edit Album";

			open();

			expect(document.title).toBe(`${title} — ReGrind`);

			await setLocale({ locale: "en-XA" });

			await vi.waitFor(() =>
				expect(document.title).toMatch(PSEUDO_TITLE),
			);
		},
	);
});
