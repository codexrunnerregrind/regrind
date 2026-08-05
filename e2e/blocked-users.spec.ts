import { expect, type Page, test } from "@playwright/test";

import { installTauriShim } from "./support/app";

// The demo API keeps its blocked set in page memory, so every navigation here is
// client-side — a full reload would reset it and hide whether a block landed.
async function openBlockedUsers(page: Page): Promise<void> {
	await page.getByText("Blocked users", { exact: true }).click();
	await expect(page).toHaveURL(/\/settings\/account\/blocked$/);
}

test.describe("blocked users settings screen", () => {
	test("lists blocked profiles and unblocks one", async ({ page }) => {
		await installTauriShim(page);
		await page.goto("/settings/account");

		await openBlockedUsers(page);
		await expect(
			page.getByText("Blocked Users", { exact: true }),
			"the nav bar is titled rather than blank",
		).toBeVisible();

		const unblockButtons = page.getByRole("button", { name: "Unblock" });
		await expect(unblockButtons).toHaveCount(2);

		await unblockButtons.first().click();
		await expect(unblockButtons).toHaveCount(1);
		await expect(
			page,
			"the row is a link, but its Unblock button must not navigate",
		).toHaveURL(/\/settings\/account\/blocked$/);

		// Leave and come back: the list is rebuilt from the server, so a stale
		// blocked-users cache would resurrect the entry just unblocked.
		await page.getByRole("link").first().click();
		await expect(page).toHaveURL(/\/settings\/account$/);
		await openBlockedUsers(page);
		await expect(page.getByRole("button", { name: "Unblock" })).toHaveCount(1);
	});

	test("the chat menu can block, and the block lands in the list", async ({
		page,
	}) => {
		await installTauriShim(page);
		await page.goto("/chat/100001:123456000");

		const blockItem = page.getByRole("menuitem", { name: "Block" });
		const confirm = page.getByRole("button", { name: "Block", exact: true });

		// Cancelling the confirmation must leave the conversation untouched.
		await page.getByLabel("Conversation menu").click();
		await blockItem.click();
		await expect(page.getByRole("alertdialog")).toBeVisible();
		await page.getByRole("button", { name: "Cancel" }).click();
		await expect(page.getByRole("alertdialog")).toBeHidden();
		await expect(page).toHaveURL(/\/chat\/100001/);

		await page.getByLabel("Conversation menu").click();
		await blockItem.click();
		await confirm.click();

		await expect(page, "blocking leaves the conversation").toHaveURL(/\/chat$/);

		await page.locator('a[href="/settings"]').click();
		await page.getByText("Account Settings", { exact: true }).click();
		await openBlockedUsers(page);
		await expect(
			page.getByRole("button", { name: "Unblock" }),
			"the person just blocked joins the two seeded blocks",
		).toHaveCount(3);
	});
});
