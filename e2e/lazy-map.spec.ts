import { expect, test } from "@playwright/test";

import { installTauriShim } from "./support/app";

test("maplibre is not loaded until the location picker opens", async ({
	page,
}) => {
	test.setTimeout(300_000);
	const maplibreRequests: string[] = [];
	page.on("request", (request) => {
		if (/maplibre/i.test(request.url()))
			maplibreRequests.push(request.url());
	});

	await installTauriShim(page);
	await page.goto("/");
	await page.locator("nav a").first().waitFor({ timeout: 120_000 });
	await page.getByRole("button", { name: "Pick manually" }).waitFor();
	expect(maplibreRequests).toEqual([]);

	await page.getByRole("button", { name: "Pick manually" }).click();
	await page
		.getByPlaceholder("Search places...")
		.waitFor({ timeout: 180_000 });
	expect(maplibreRequests.length).toBeGreaterThan(0);
});
