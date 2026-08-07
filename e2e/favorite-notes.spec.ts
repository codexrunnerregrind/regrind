import { expect, type Page, test } from "@playwright/test";

import { installTauriShim, openBrowseGrid } from "./support/app";

// The demo notes live in page memory, so a save is checked by navigating
// client-side — a reload would reset the mock and hide whether it landed.
// 100001 is a seeded favorite the demo never attaches a note to.
const UNNOTED_FAVORITE = "/profile/100001";
// A favorite whose note writes the demo API accepts and then drops, the way the
// real one has been seen to.
const WRITE_DROPPED_FAVORITE = "/profile/100013";

const SEEDED_NOTE = "Met at the bar on Rua Nova";

function noteCard(page: Page, text: string) {
	return page.getByRole("link").filter({ hasText: text });
}

test.describe("favorite notes", () => {
	test("a note shows on the card and on the profile, and edits reach both", async ({
		page,
	}) => {
		await openBrowseGrid(page);

		await expect(
			noteCard(page, SEEDED_NOTE),
			"the note is shown on the favorite's card",
		).toHaveCount(1);
		await noteCard(page, SEEDED_NOTE).click();
		await expect(page).toHaveURL(/\/profile\/\d+$/);

		const pill = page.getByRole("button", { name: "Edit note" });
		await expect(pill, "the stored note is the pill's label").toContainText(
			"Met at the bar",
		);

		await pill.click();
		const note = page.getByRole("textbox", { name: "Note" });
		await expect(note).toHaveValue(SEEDED_NOTE);

		await note.fill("Neighbour, plays padel");
		await page.getByLabel("Phone number").fill("912345678");
		await page.getByRole("button", { name: "Save" }).click();

		await expect(pill).toContainText("Neighbour, plays padel");

		// Reopening reads the note back rather than the draft that was typed.
		await pill.click();
		await expect(page.getByRole("textbox", { name: "Note" })).toHaveValue(
			"Neighbour, plays padel",
		);
		await expect(page.getByLabel("Phone number")).toHaveValue("912345678");
		await page.keyboard.press("Escape");

		await page.goBack();
		await expect(page).toHaveURL(/\/$/);
		await expect(
			noteCard(page, "Neighbour, plays padel"),
			"the card follows the edit without the grid being reloaded",
		).toHaveCount(1);
	});

	test("a favorite with no note offers to add one, and it can be deleted", async ({
		page,
	}) => {
		await installTauriShim(page);
		await page.goto(UNNOTED_FAVORITE);

		const addPill = page.getByRole("button", { name: "Add note" });
		await expect(addPill).toBeVisible();
		await addPill.click();

		await expect(
			page.getByRole("button", { name: "Delete note" }),
			"there is nothing to delete yet",
		).toBeHidden();

		await page.getByRole("textbox", { name: "Note" }).fill("Met in Braga");
		await page.getByRole("button", { name: "Save" }).click();

		const editPill = page.getByRole("button", { name: "Edit note" });
		await expect(editPill).toContainText("Met in Braga");

		await editPill.click();
		await page.getByRole("button", { name: "Delete note" }).click();
		await expect(
			page.getByRole("button", { name: "Add note" }),
			"deleting falls back to the empty pill",
		).toBeVisible();
	});

	test("a long note stays one trimmed pill at the top of the photo", async ({
		page,
	}) => {
		await openBrowseGrid(page);
		await noteCard(page, SEEDED_NOTE).click();

		const pill = page.getByRole("button", { name: "Edit note" });
		await pill.click();
		await page
			.getByRole("textbox", { name: "Note" })
			.fill(
				"Met at the beach bar in Braga last summer, works nights at the hospital",
			);
		await page.getByRole("button", { name: "Save" }).click();
		await expect(pill).toBeVisible();

		const box = await pill.boundingBox();
		const viewport = page.viewportSize();
		if (box === null || viewport === null)
			throw new Error("pill not laid out");

		expect(
			box.width,
			"the pill is capped at half the width instead of growing with the note",
		).toBeLessThanOrEqual(viewport.width / 2 + 1);
		expect(
			box.x + box.width,
			"and it stays inside the photo rather than running off the edge",
		).toBeLessThanOrEqual(viewport.width);
		expect(box.height, "on one line").toBeLessThan(48);
		expect(box.y, "near the top of the photo").toBeLessThan(120);
	});

	test("a write the server drops keeps the text and reports itself", async ({
		page,
	}) => {
		await installTauriShim(page);
		await page.goto(WRITE_DROPPED_FAVORITE);

		await page.getByRole("button", { name: "Add note" }).click();
		const note = page.getByRole("textbox", { name: "Note" });
		await note.fill("probe123");
		await page.getByRole("button", { name: "Save" }).click();

		await expect(
			page.getByText(/The server accepted this note but kept nothing/),
		).toBeVisible();
		await expect(
			note,
			"the text survives so it is not lost with the drawer",
		).toHaveValue("probe123");
		await expect(
			page.getByRole("button", { name: "Edit note" }),
			"and the pill does not claim a note that was not stored",
		).toBeHidden();
	});
});
