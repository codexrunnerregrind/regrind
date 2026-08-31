import { expect, type Page, test } from "@playwright/test";

import { DEMO_CONVERSATION, installTauriShim } from "./support/app";

const CONVERSATION_LINK = 'a[href^="/chat/1"]';

// The seeds behind the demo inbox: one conversation is both starred and unread,
// so the two filters together are a narrower set than either alone.
const UNREAD = ["/chat/100001:123456000", "/chat/100006:123456000"];

async function listedConversations(page: Page): Promise<string[]> {
	const hrefs = await page
		.locator(CONVERSATION_LINK)
		.evaluateAll((links) =>
			links.map((link) => link.getAttribute("href") ?? ""),
		);
	return [...new Set(hrefs)];
}

async function openInbox(page: Page) {
	await installTauriShim(page);
	await page.goto("/chat");
	await page.locator(CONVERSATION_LINK).first().waitFor({ timeout: 60_000 });
}

test("the star filter narrows the list to favorites and back", async ({
	page,
}) => {
	await openInbox(page);

	const unfiltered = await listedConversations(page);
	expect(unfiltered.length).toBeGreaterThan(1);
	expect(unfiltered).toContain(DEMO_CONVERSATION);

	const star = page.getByRole("button", { name: "Favorites", exact: true });
	await star.click();

	await expect
		.poll(() => listedConversations(page))
		.toEqual([DEMO_CONVERSATION]);

	await star.click();

	await expect.poll(() => listedConversations(page)).toEqual(unfiltered);
});

test("the unread filter narrows the list to unread conversations and back", async ({
	page,
}) => {
	await openInbox(page);

	const unfiltered = await listedConversations(page);
	const unreadPill = page.getByRole("button", {
		name: "Unread",
		exact: true,
	});
	await unreadPill.click();

	await expect
		.poll(() => listedConversations(page))
		.toEqual(expect.arrayContaining(UNREAD));
	const filtered = await listedConversations(page);
	expect(filtered.length).toBeLessThan(unfiltered.length);

	await unreadPill.click();

	await expect.poll(() => listedConversations(page)).toEqual(unfiltered);
});

test("both filters together keep only the conversations matching each", async ({
	page,
}) => {
	await openInbox(page);

	await page.getByRole("button", { name: "Unread", exact: true }).click();
	await page.getByRole("button", { name: "Favorites", exact: true }).click();

	await expect
		.poll(() => listedConversations(page))
		.toEqual([DEMO_CONVERSATION]);
});

test("unstarring the last favorite leaves the filtered list on the generic empty state", async ({
	page,
}) => {
	await openInbox(page);

	await page.getByRole("button", { name: "Favorites", exact: true }).click();
	await expect
		.poll(() => listedConversations(page))
		.toEqual([DEMO_CONVERSATION]);

	await page.locator(`a[href="${DEMO_CONVERSATION}"]`).first().click();
	await page.locator('a[href^="/profile/"]').first().click();
	await page.getByRole("switch", { name: "Remove from favorites" }).click();
	await expect(
		page.getByRole("switch", { name: "Add to favorites" }),
	).toBeVisible();

	await page.locator('a[href="/chat"]').first().click();

	await expect(page.getByText("No Results")).toBeVisible();
	await expect(
		page.getByText("No conversations match these filters."),
	).toBeVisible();
	expect(await listedConversations(page)).toEqual([]);
});

test("the filters sit on the title's line, above the tabs", async ({
	page,
}) => {
	await openInbox(page);

	const title = page.getByRole("heading", { name: "Inbox" });
	await expect(title).toBeVisible();

	const titleBox = (await title.boundingBox())!;
	const tabsBox = (await page
		.getByRole("tab", { name: "Messages" })
		.boundingBox())!;
	const pillBox = (await page
		.getByRole("button", { name: "Online", exact: true })
		.boundingBox())!;

	// Beside the title, not over it, and clear of the tabs below.
	expect(pillBox.x).toBeGreaterThan(titleBox.x + titleBox.width);
	expect(pillBox.y).toBeLessThan(tabsBox.y);
});

test("favorites is the star alone; the other two say what they are", async ({
	page,
}) => {
	await openInbox(page);

	// Icon-only, so its name comes from the aria-label rather than its text.
	await expect(
		page.getByRole("button", { name: "Favorites", exact: true }),
	).toHaveText("");
	await expect(
		page.getByRole("button", { name: "Unread", exact: true }),
	).toHaveText("Unread");
	await expect(
		page.getByRole("button", { name: "Online", exact: true }),
	).toHaveText("Online");
});

test("the online filter keeps exactly the conversations showing a status dot", async ({
	page,
}) => {
	await openInbox(page);

	// Which demo peers are online is seeded per profile id, so the expectation
	// comes from the unfiltered list itself rather than a hardcoded set.
	const onlineRows = page
		.locator(CONVERSATION_LINK)
		.filter({ has: page.locator('[title="Online now"]') });
	const expected = await onlineRows.count();
	expect(expected).toBeGreaterThan(0);

	await page.getByRole("button", { name: "Online", exact: true }).click();

	await expect
		.poll(async () => (await listedConversations(page)).length)
		.toBe(expected);
	expect(await onlineRows.count()).toBe(expected);
});

test("the filters belong to the inbox tab, not to albums", async ({ page }) => {
	await openInbox(page);

	const star = page.getByRole("button", { name: "Favorites", exact: true });
	await expect(star).toBeVisible();

	await page.getByRole("tab", { name: "Albums" }).click();
	await expect(star).toHaveCount(0);

	await page.getByRole("tab", { name: "Messages" }).click();
	await expect(star).toBeVisible();
});

test("the filter is session-only", async ({ page }) => {
	await openInbox(page);

	const star = page.getByRole("button", { name: "Favorites", exact: true });
	await star.click();
	await expect(star).toHaveAttribute("aria-pressed", "true");

	await page.reload();
	await page.locator(CONVERSATION_LINK).first().waitFor({ timeout: 60_000 });

	await expect(
		page.getByRole("button", { name: "Favorites", exact: true }),
	).toHaveAttribute("aria-pressed", "false");
});

test("selection mode takes the filters away and gives them back", async ({
	page,
}) => {
	await openInbox(page);

	const star = page.getByRole("button", { name: "Favorites", exact: true });
	const unreachable = () =>
		star.evaluate((node) => node.closest("[inert]") !== null);
	await expect(star).toBeVisible();
	expect(await unreachable()).toBe(false);

	await page.locator(CONVERSATION_LINK).first().click({ button: "right" });

	const exitSelection = page.getByRole("button", { name: "Exit selection" });
	await expect(exitSelection).toBeVisible();
	await expect.poll(unreachable).toBe(true);

	await exitSelection.click();

	await expect.poll(unreachable).toBe(false);
});
