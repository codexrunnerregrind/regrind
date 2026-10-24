import { expect, type Page, test } from "@playwright/test";

import { openSharedAlbum, SHARED_ALBUM_ID } from "./support/albums";
import { installTauriShim, openGrid } from "./support/app";
import { stackSettled, systemBack } from "./support/page-stack";
import { activeProfilePane } from "./support/profile-pager";
import {
	cancelSystemBack,
	commitSystemBack,
	startSystemBack,
} from "./support/system-back";

const GRID_TILE = '.photo-grid a[href^="/profile/"]';
const BROWSE_URL = /\/$/;
const ALBUM_URL = new RegExp(`/settings/albums/${SHARED_ALBUM_ID}$`);

const menu = (page: Page) => page.getByRole("menu");

async function openProfileFromGrid(page: Page): Promise<RegExp> {
	await installTauriShim(page, { platform: "android" });
	await openGrid(page);
	const tile = page.locator(GRID_TILE).first();
	await tile.waitFor({ timeout: 60_000 });
	const profileUrl = new RegExp(`${await tile.getAttribute("href")}$`);
	await tile.click();
	await expect(page).toHaveURL(profileUrl);
	await activeProfilePane(page)
		.getByRole("button", { name: "Block profile" })
		.waitFor({ timeout: 60_000 });
	return profileUrl;
}

test.describe.configure({ timeout: 240_000 });

test("Back leaves a profile with no menu open", async ({ page }) => {
	await openProfileFromGrid(page);

	const { handled } = await systemBack(page);

	expect(handled, "nothing on the profile claims Back").toBe(false);
	await expect(page).toHaveURL(BROWSE_URL);
});

test("an open menu keeps the back gesture from sliding the settings page", async ({
	page,
}) => {
	await openSharedAlbum(page);
	expect(await startSystemBack(page), "the page slides with no menu").toBe(
		true,
	);
	await cancelSystemBack(page);
	await stackSettled(page);

	await page.getByRole("button", { name: "Album menu" }).click();
	await expect(menu(page)).toBeVisible();

	expect(await startSystemBack(page), "the menu owns the gesture").toBe(
		false,
	);
	await cancelSystemBack(page);
	await expect(menu(page)).toBeVisible();

	expect(await startSystemBack(page)).toBe(false);
	expect(await commitSystemBack(page)).toBe(false);
	await expect(menu(page)).toHaveCount(0);
	await stackSettled(page);
	await expect(page).toHaveURL(ALBUM_URL);
});
