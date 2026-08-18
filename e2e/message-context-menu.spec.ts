import { expect, test } from "@playwright/test";

import { installTauriShim } from "./support/app";

const CONVERSATION = "/chat/100001:123456000";

test("right-clicking a message opens its context menu", async ({ page }) => {
	await installTauriShim(page);
	await page.goto(CONVERSATION);

	const bubble = page.getByText("Hey! Lorem ipsum dolor sit amet.").first();
	await bubble.waitFor();

	await bubble.click({ button: "right" });

	await expect(
		page.getByRole("button", { name: "Copy message" }),
	).toBeVisible();
});

// Media bubbles register their element through an attachment rather than the
// text bubble's own ref, so they get their own case: a regression there leaves
// the long press (and with it unsend) doing nothing at all.
test("right-clicking a media message opens its context menu", async ({
	page,
}) => {
	await installTauriShim(page);
	await page.goto(CONVERSATION);

	const media = page
		.getByRole("button", { name: "Open this photo in the album" })
		.first();
	await media.waitFor();

	await media.click({ button: "right" });

	await expect(page.getByRole("button", { name: "Reply" })).toBeVisible();
});
