import { expect, test } from "@playwright/test";

import { installTauriShim } from "./support/app";

test("the expiring image label stays on one line", async ({ page }) => {
	await installTauriShim(page);
	await page.goto("/chat/100006:123456000");
	const label = page.getByText("Expiring image", { exact: true });
	await expect(label).toBeVisible({ timeout: 60_000 });
	await page.evaluate(() => document.fonts.ready);
	const lines = await label.evaluate(
		(element) =>
			element.getBoundingClientRect().height /
			parseFloat(getComputedStyle(element).lineHeight),
	);
	expect(Math.round(lines)).toBe(1);
});
