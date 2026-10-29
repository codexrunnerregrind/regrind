import { expect, test } from "@playwright/test";

import { FIRST_ROUTE_COMPILE_MS, installTauriShim } from "./support/app";

const BLOCKED_LIST = "/settings/account/blocked";

test.beforeEach(async ({ page }) => {
	await installTauriShim(page);
});

test("account settings link to the profile lists", async ({ page }) => {
	await page.goto("/settings/account");
	await page
		.getByRole("link", { name: "Blocked users" })
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });

	for (const [name, href] of [
		["Blocked users", BLOCKED_LIST],
		["Hidden users", "/settings/account/hidden"],
	]) {
		await expect(page.getByRole("link", { name })).toHaveAttribute(
			"href",
			href!,
		);
	}
	await expect(page.getByRole("link", { name: "Starred users" })).toHaveCount(
		0,
	);
});

test("the hidden list renders its own empty state", async ({ page }) => {
	await page.goto("/settings/account/hidden");
	await expect(page.getByText("You haven't hidden anyone.")).toBeVisible({
		timeout: 60_000,
	});
});

test("blocked profiles that cannot be resolved still get a row", async ({
	page,
}) => {
	await page.goto(BLOCKED_LIST);

	const unblockButtons = page.getByRole("button", { name: "Unblock" });
	await unblockButtons.first().waitFor({ timeout: 60_000 });
	await expect(unblockButtons).toHaveCount(12);
	await expect(page.getByText("12 blocked")).toBeVisible();

	await expect(page.getByText("Profile 100802")).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Unblock profile 100802" }),
	).toBeVisible();
});

test("unblocking takes the row out of the list without leaving it", async ({
	page,
}) => {
	await page.goto(BLOCKED_LIST);

	const unavailable = page.getByRole("button", {
		name: "Unblock profile 100802",
	});
	await unavailable.waitFor({ timeout: 60_000 });

	await unavailable.click();

	await expect(unavailable).toHaveCount(0);
	await expect(page).toHaveURL(new RegExp(`${BLOCKED_LIST}$`));
	await expect(page.getByRole("button", { name: "Unblock" })).toHaveCount(11);
	await expect(page.getByText("11 blocked")).toBeVisible();
});

test("the blocked list comes back to where it was scrolled", async ({
	page,
}) => {
	await page.goto(BLOCKED_LIST);
	const scroller = page.locator(".overflow-y-auto").first();
	await page
		.getByRole("button", { name: "Unblock" })
		.first()
		.waitFor({ timeout: 60_000 });

	await scroller.evaluate((node) => node.scrollTo({ top: 400 }));
	await expect
		.poll(() => scroller.evaluate((node) => Math.round(node.scrollTop)))
		.toBe(400);

	// dispatched rather than clicked: playwright scrolls a click target into
	// view first, and its idea of "into view" here is the top of the list,
	// which would wipe the scroll position this test is about
	const onScreen = await page.evaluate(() =>
		[...document.querySelectorAll('a[href^="/profile/"]')].findIndex(
			(link) => {
				const box = link.getBoundingClientRect();
				return box.top > 100 && box.bottom < 700;
			},
		),
	);
	expect(onScreen).toBeGreaterThan(-1);
	await page
		.locator('a[href^="/profile/"]')
		.nth(onScreen)
		.dispatchEvent("click");
	await expect(page).toHaveURL(/\/profile\/\d+$/);

	await page.goBack();
	await expect(page).toHaveURL(new RegExp(`${BLOCKED_LIST}$`));
	await expect
		.poll(() => scroller.evaluate((node) => Math.round(node.scrollTop)))
		.toBe(400);
});
