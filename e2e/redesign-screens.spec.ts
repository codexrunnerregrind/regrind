import { expect, type Page, test } from "@playwright/test";

import { ensureGridLocation, installTauriShim } from "./support/app";

// Visual proof for the Nearby redesign: one shot of each retouched screen in
// each theme. Assertions here are structural — the screenshots are the point,
// and the behavioural specs elsewhere already cover what these screens do.

const THEMES = ["dark", "light"] as const;

// The app now defaults to Dark regardless of the OS setting, so the light pass
// picks the theme the way a user would — through Appearance — rather than by
// emulating a colour scheme the app deliberately ignores.
async function setTheme(page: Page, theme: (typeof THEMES)[number]) {
	await page.goto("/settings/appearance");
	await page
		.getByRole("radio", { name: "Light", exact: true })
		.waitFor({ timeout: 60_000 });
	await page
		.getByRole("radio", { name: theme === "dark" ? "Dark" : "Light" })
		.click();
	await expect(page.locator("html")).toHaveClass(
		theme === "dark" ? /dark/ : /^(?!.*dark).*$/,
	);
}

async function openApp(page: Page, theme: (typeof THEMES)[number]) {
	test.setTimeout(240_000);
	await installTauriShim(page);
	await page.goto("/");
	await page.locator("nav a").first().waitFor({ timeout: 120_000 });
	if (theme === "light") await setTheme(page, "light");
	await page.goto("/");
	await ensureGridLocation(page);
	await page
		.locator('a[href^="/profile/"]')
		.first()
		.waitFor({ timeout: 60_000 });
}

for (const theme of THEMES) {
	test.describe(`${theme} theme`, () => {
		test("browse grid and tab bar", async ({ page }) => {
			await openApp(page, theme);

			await expect(
				page.getByRole("link", { name: "Browse" }),
			).toBeVisible();
			await expect(
				page.getByRole("link", { name: "Interest" }),
			).toBeVisible();
			await expect(page.getByRole("link", { name: "You" })).toBeVisible();

			await page.screenshot({
				path: `test-results/redesign-browse-${theme}.png`,
			});
		});

		test("favorites: name and note share one plate", async ({ page }) => {
			await openApp(page, theme);
			await page.getByLabel("Favorites").click();
			await expect(page.getByLabel("Search notes")).toBeVisible();

			const noted = page
				.getByRole("link")
				.filter({ hasText: "Met at the bar on Rua Nova" });
			await expect(noted).toHaveCount(1);
			await expect(noted.getByLabel("Has a note")).toBeVisible();

			await page.screenshot({
				path: `test-results/redesign-favorites-${theme}.png`,
			});
		});

		test("inbox", async ({ page }) => {
			await openApp(page, theme);
			await page.getByRole("link", { name: "Inbox" }).click();

			await expect(
				page.getByRole("heading", { name: "Inbox" }),
			).toBeVisible();
			await expect(
				page.getByRole("tab", { name: "Messages" }),
			).toBeVisible();
			await expect(
				page.getByRole("tab", { name: "Albums" }),
			).toBeVisible();

			await page.screenshot({
				path: `test-results/redesign-inbox-${theme}.png`,
			});
		});

		test("inbox albums", async ({ page }) => {
			await openApp(page, theme);
			await page.getByRole("link", { name: "Inbox" }).click();
			await page.getByRole("tab", { name: "Albums" }).click();

			await expect(
				page.getByRole("button", { name: "My albums" }),
			).toBeVisible();

			await page.screenshot({
				path: `test-results/redesign-inbox-albums-${theme}.png`,
			});
		});

		test("edit album", async ({ page }) => {
			await openApp(page, theme);
			await page.goto("/albums");
			// The first tile is the album itself; "New album" is a separate cell.
			await page
				.getByRole("button", { name: /^Open / })
				.first()
				.click();

			await expect(page.getByText("Album name")).toBeVisible();
			await expect(
				page.getByText("Photos", { exact: true }),
			).toBeVisible();
			await expect(
				page.getByText("Cover", { exact: true }),
			).toBeVisible();

			await page.screenshot({
				path: `test-results/redesign-edit-album-${theme}.png`,
				fullPage: true,
			});
		});

		test("blocked users", async ({ page }) => {
			await openApp(page, theme);
			await page.goto("/settings/account/blocked");

			await expect(page.getByText(/BLOCKED/)).toBeVisible();
			await expect(
				page.getByRole("button", { name: /^Unblock/ }).first(),
			).toBeVisible();

			await page.screenshot({
				path: `test-results/redesign-blocked-${theme}.png`,
			});
		});

		test("interest views", async ({ page }) => {
			await openApp(page, theme);
			await page.getByRole("link", { name: "Interest" }).click();

			await expect(
				page.getByRole("tab", { name: "Views" }),
			).toBeVisible();
			await expect(page.locator(".tile-scrim").first()).toBeVisible();

			await page.screenshot({
				path: `test-results/redesign-views-${theme}.png`,
			});
		});
	});
}
