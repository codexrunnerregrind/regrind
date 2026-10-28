import { expect, type Page, test } from "@playwright/test";

import { historyDepth, TrustedTouch } from "./support/app";
import { openTaps, PAGER, TAPS, VIEWS } from "./support/interest-pager";

const SENT = "/interest/sent";
const MATCHES = "/interest/matches";
const pane = (name: string) => `[data-slot="interest-pane-${name}"]`;
const shownScroller = `${PAGER} [data-slot^="interest-pane-"]:not([inert]) [data-slot$="-scroller"]`;

test.beforeEach(async ({ page }) => {
	await openTaps(page);
});

/** Tabs the track has moved: 1 rests on Taps, 1.5 is halfway to Matches. */
function trackPosition(page: Page) {
	return page.locator(`${PAGER} > div`).evaluate((track) => {
		const pager = track.parentElement!;
		return (
			-new DOMMatrix(getComputedStyle(track).transform).m41 /
			pager.clientWidth
		);
	});
}

async function drag(
	page: Page,
	{
		dx,
		dy = 0,
		release = true,
	}: { dx: number; dy?: number; release?: boolean },
) {
	const box = (await page.locator(shownScroller).boundingBox())!;
	const x = dx < 0 ? box.x + box.width * 0.75 : box.x + box.width * 0.25;
	const y = box.y + box.height / 2;
	const touch = await TrustedTouch.attach(page);
	await touch.drag(
		page,
		{ x, y },
		{ x: x + dx, y: y + dy },
		{ steps: 16, holdMs: 16, release },
	);
	return touch;
}

test("the pager rests on the routed tab with only it and its neighbours mounted", async ({
	page,
}) => {
	await expect.poll(() => trackPosition(page)).toBeCloseTo(1, 2);
	await expect(page.locator(`${pane("sent")} > *`)).toHaveCount(0);
	await expect(page.locator(pane("taps"))).not.toHaveAttribute("inert");
	await expect(page.locator(pane("views"))).toHaveAttribute("inert");
});

test("a drag inside the list pages to the neighbouring tab, replacing the URL", async ({
	page,
}) => {
	const before = await historyDepth(page);

	await drag(page, { dx: 260 });

	await expect(page).toHaveURL(new RegExp(`${VIEWS}$`));
	await expect.poll(() => trackPosition(page)).toBeCloseTo(0, 2);
	expect(await historyDepth(page)).toBe(before);
});

test("the track follows a held finger and keeps the URL until it lifts", async ({
	page,
}) => {
	const touch = await drag(page, { dx: -200, release: false });

	const held = await trackPosition(page);
	expect(held).toBeGreaterThan(1.2);
	expect(held).toBeLessThan(2);
	await expect(page).toHaveURL(new RegExp(`${TAPS}$`));

	await touch.end();
	await expect(page).toHaveURL(new RegExp(`${MATCHES}$`));
});

test("a hard flick moves one tab, no further", async ({ page }) => {
	await drag(page, { dx: -380 });

	await expect(page).toHaveURL(new RegExp(`${MATCHES}$`));
	await expect.poll(() => trackPosition(page)).toBeCloseTo(2, 2);
});

test("a short drag springs back without changing tab", async ({ page }) => {
	const touch = await TrustedTouch.attach(page);
	const box = (await page.locator(shownScroller).boundingBox())!;
	const y = box.y + box.height / 2;
	await touch.drag(
		page,
		{ x: 300, y },
		{ x: 270, y },
		{ steps: 10, holdMs: 40 },
	);

	await expect.poll(() => trackPosition(page)).toBeCloseTo(1, 2);
	await expect(page).toHaveURL(new RegExp(`${TAPS}$`));
});

test("a vertical drag scrolls the list and does not page", async ({ page }) => {
	await drag(page, { dx: 12, dy: -260 });

	await expect(page).toHaveURL(new RegExp(`${TAPS}$`));
	expect(await trackPosition(page)).toBeCloseTo(1, 2);
});

test("a tab tap slides straight to a far tab", async ({ page }) => {
	await page.getByRole("tab", { name: "Sent" }).click();

	await expect(page).toHaveURL(new RegExp(`${SENT}$`));
	await expect.poll(() => trackPosition(page)).toBeCloseTo(3, 2);
	await expect(page.locator(pane("sent"))).not.toHaveAttribute("inert");
});
