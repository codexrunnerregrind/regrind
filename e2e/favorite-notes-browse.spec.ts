import { expect, type Page, test } from "@playwright/test";

import { openBrowseGrid } from "./support/app";

const SEEDED_NOTE = "Met at the bar on Rua Nova";

function card(page: Page, text: string) {
	return page.getByRole("link").filter({ hasText: text });
}

test.describe("favorite notes in the browse grid", () => {
	test("notes and their badges show on favorited profiles", async ({
		page,
	}) => {
		await openBrowseGrid(page);

		await expect(card(page, SEEDED_NOTE)).toHaveCount(1);
		await expect(
			card(page, SEEDED_NOTE).getByLabel("Has a note"),
			"the badge reads even where the note text is trimmed",
		).toBeVisible();
		await expect(
			page.getByLabel("Has a note"),
			"only the annotated favorites carry one",
		).toHaveCount(3);
	});

	test("the search field belongs to the favorites filter", async ({ page }) => {
		await openBrowseGrid(page);

		const search = page.getByLabel("Search notes");
		await expect(search, "hidden until favorites are being shown").toBeHidden();

		await page.getByLabel("Favorites").click();
		await expect(search).toBeVisible();

		await page.getByLabel("Favorites").click();
		await expect(
			search,
			"and it goes away with the filter it belongs to",
		).toBeHidden();
	});

	test("searching notes narrows the grid to the matches", async ({ page }) => {
		await openBrowseGrid(page);
		await page.getByLabel("Favorites").click();

		const search = page.getByLabel("Search notes");
		await search.fill("gym");

		await expect(card(page, "Gym buddy, works nights")).toHaveCount(1);
		await expect(card(page, SEEDED_NOTE)).toHaveCount(0);

		// The phone number stored with a note is matched too.
		await search.fill("912345678");
		await expect(card(page, "Gym buddy, works nights")).toHaveCount(1);

		await search.fill("nothing matches this");
		await expect(page.getByText("No Matches")).toBeVisible();

		await page.getByRole("button", { name: "Clear search" }).click();
		await expect(
			card(page, SEEDED_NOTE),
			"clearing brings the whole grid back",
		).toHaveCount(1);
	});
});
