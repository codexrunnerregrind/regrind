import { expect, type Page, test } from "@playwright/test";

import { installTauriShim } from "./support/app";

const TEXT_FIELDS = [
	"Display name",
	"About me",
	"Height",
	"Weight",
	"Last tested",
	"Instagram",
	"X",
	"Facebook",
];
const DROPDOWNS = [
	"Position",
	"Body type",
	"Ethnicity",
	"Relationship status",
	"My tribes",
	"Tribes I'm into",
	"Looking for",
	"Meet at",
	"Accept NSFW pics",
	"HIV status",
	"Sexual health practices",
	"Vaccines",
];
const COMBOBOXES = ["Tags", "Gender", "Pronouns"];

const fieldLabel = (page: Page, name: string) =>
	page
		.locator('[data-slot="label"]')
		.filter({ hasText: new RegExp(`^${name}$`) });
const dropdown = (page: Page, name: string) =>
	page.getByRole("button", { name: new RegExp(`^${name} `) });
const combobox = (page: Page, name: string) =>
	page.getByRole("combobox", { name, exact: true });

async function nextFrame(page: Page): Promise<void> {
	await page.evaluate(
		() => new Promise((framed) => requestAnimationFrame(framed)),
	);
}

test.beforeEach(async ({ page }) => {
	await installTauriShim(page);
	await page.goto("/settings/profile");
	await fieldLabel(page, "Display name").waitFor({ timeout: 60_000 });
});

test("tapping a text field's label focuses the field", async ({ page }) => {
	for (const name of TEXT_FIELDS) {
		await fieldLabel(page, name).click();
		await expect(page.getByLabel(name, { exact: true })).toBeFocused();
	}
});

test("every picker takes its name from its label", async ({ page }) => {
	for (const name of DROPDOWNS)
		await expect(dropdown(page, name)).toBeVisible();
	for (const name of COMBOBOXES)
		await expect(combobox(page, name)).toBeVisible();
	await expect(page.getByRole("slider", { name: "Age" })).toBeVisible();

	await combobox(page, "Tags").click();
	await expect(page.getByRole("listbox", { name: "Tags" })).toBeVisible();
});

test("tapping a stacked picker's label leaves the picker closed", async ({
	page,
}) => {
	const tags = combobox(page, "Tags");

	await fieldLabel(page, "Tags").click();
	await nextFrame(page);
	expect(await tags.getAttribute("aria-expanded")).toBe("false");

	await tags.click();
	await expect(tags).toHaveAttribute("aria-expanded", "true");
	await page.keyboard.press("Escape");
	await expect(tags).toHaveAttribute("aria-expanded", "false");
});

// An inline dropdown row is its own trigger, label included: the whole band is
// tappable rather than a button on the trailing edge.
test("tapping an inline dropdown's label opens it", async ({ page }) => {
	const position = dropdown(page, "Position");

	expect(await position.getAttribute("aria-expanded")).toBe("false");

	await position.getByText("Position", { exact: true }).click();

	await expect(position).toHaveAttribute("aria-expanded", "true");
});
