import { expect, test } from "@playwright/test";

import { DEMO_CONVERSATION, installTauriShim } from "./support/app";
import {
	ALBUM_TILE,
	DRAWER,
	MEDIA_TILE,
	openAttachments,
	SELECTED_ALBUM_TILE,
} from "./support/drawer";
import { CHAT_MEDIA_HOST, serveImages } from "./support/media";
import { expectNoToast } from "./support/toast";

const OTHER_CONVERSATION = "/chat/100009:123456000";

test.describe("composer albums tab", () => {
	test("each tab arms Send from its own selection", async ({ page }) => {
		await serveImages(page, CHAT_MEDIA_HOST);
		await openAttachments(page);

		await page.getByRole("tab", { name: "Albums" }).click();
		const tiles = page.locator(ALBUM_TILE);
		await expect(tiles.first()).toBeVisible({ timeout: 30_000 });
		await expect(
			page.locator(`${ALBUM_TILE}[disabled]`),
			"a non-shareable album cannot be picked",
		).toHaveCount(1);

		const send = page.getByRole("button", { name: /^Send/ });
		await tiles.first().click();
		await expect(send).toBeVisible();

		await page.getByRole("tab", { name: "Media" }).click();
		await expect(
			send,
			"an album selection must not arm Send on the media tab",
		).toBeHidden();

		await page.getByRole("tab", { name: "Albums" }).click();
		await expect(send).toBeVisible();

		await send.click();
		await expect(page.locator(DRAWER)).toBeHidden();

		await expectNoToast(page, "Couldn't share album");
	});

	test("a conversation change closes the armed drawer", async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await serveImages(page, CHAT_MEDIA_HOST);
		await installTauriShim(page);

		await page.goto(DEMO_CONVERSATION);
		await page.waitForTimeout(2500);
		await page.locator(`a[href='${OTHER_CONVERSATION}']`).first().click();
		await page.waitForTimeout(2000);
		expect(page.url()).toContain(OTHER_CONVERSATION);

		await page.getByRole("button", { name: "Add attachment" }).click();
		await page.locator(DRAWER).waitFor({ timeout: 10_000 });
		await page.getByRole("tab", { name: "Albums" }).click();
		const tiles = page.locator(ALBUM_TILE);
		await expect(tiles.first()).toBeVisible({ timeout: 30_000 });
		await tiles.first().click();

		const send = page.getByRole("button", { name: /^Send/ });
		await expect(send).toBeVisible();

		await page.goBack();
		await expect(page).toHaveURL(new RegExp(`${DEMO_CONVERSATION}$`));
		await expect(
			page.locator(DRAWER),
			"a selection armed for the previous conversation must not survive",
		).toBeHidden();
		await expect(send).toBeHidden();
	});

	test("closing the drawer forgets the selection it was armed with", async ({
		page,
	}) => {
		await serveImages(page, CHAT_MEDIA_HOST);
		await openAttachments(page);

		await page.getByRole("tab", { name: "Albums" }).click();
		const tiles = page.locator(ALBUM_TILE);
		await expect(tiles.first()).toBeVisible({ timeout: 30_000 });

		const send = page.getByRole("button", { name: /^Send/ });
		await tiles.first().click();
		await expect(send).toBeVisible();

		await page.keyboard.press("Escape");
		await expect(page.locator(DRAWER)).toBeHidden();
		await page.getByRole("button", { name: "Add attachment" }).click();
		await expect(page.locator(DRAWER)).toBeVisible();
		await expect(tiles.first()).toBeVisible({ timeout: 30_000 });

		await expect(
			page.locator(SELECTED_ALBUM_TILE),
			"the reopened tab starts with nothing selected",
		).toHaveCount(0);
		await expect(
			send,
			"so Send must not still be armed from the closed drawer",
		).toBeHidden();
	});

	test("the expiry menu opens over the sheet, not off screen", async ({
		page,
	}) => {
		await serveImages(page, CHAT_MEDIA_HOST);
		await openAttachments(page);

		await page.getByRole("tab", { name: "Albums" }).click();
		const tiles = page.locator(ALBUM_TILE);
		await expect(tiles.first()).toBeVisible({ timeout: 30_000 });
		await tiles.first().click();

		await page.getByRole("button", { name: /Indefinitely/ }).click();
		const menu = page.getByRole("menu");
		await expect(menu).toBeVisible();

		// An unanchored menu still counts as visible: it is laid out, only
		// parked above the viewport where no tap can reach it.
		const box = (await menu.boundingBox())!;
		const viewport = page.viewportSize()!;
		expect(box.y, "the menu must sit inside the viewport").toBeGreaterThan(
			0,
		);
		expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

		await page.getByRole("menuitem", { name: "For 24 hours" }).click();
		await expect(
			page.getByRole("button", { name: /For 24 hours/ }),
			"the picked expiry names the button it was picked from",
		).toBeVisible();
	});

	test("album tiles are taller than the square media tiles", async ({
		page,
	}) => {
		await serveImages(page, CHAT_MEDIA_HOST);
		await openAttachments(page);

		const ratio = async (selector: string) => {
			const box = await page.locator(selector).first().boundingBox();
			if (box === null) throw new Error(`no tile for ${selector}`);
			return box.width / box.height;
		};

		await expect(page.locator(MEDIA_TILE).first()).toBeVisible({
			timeout: 30_000,
		});
		expect(await ratio(MEDIA_TILE)).toBeCloseTo(1, 1);

		await page.getByRole("tab", { name: "Albums" }).click();
		await expect(page.locator(ALBUM_TILE).first()).toBeVisible({
			timeout: 30_000,
		});
		expect(await ratio(ALBUM_TILE)).toBeCloseTo(0.75, 1);
	});
});
