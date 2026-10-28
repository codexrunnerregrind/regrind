import { expect, type Page, test } from "@playwright/test";

import {
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	TrustedTouch,
} from "./support/app";

const SHELL = '[data-slot="tab-shell-pager"]';
const pane = (label: string) => `[data-tab-pane="${label}"]`;

test.describe.configure({ timeout: 180_000 });

async function open(page: Page, path: string, ready: string) {
	await installTauriShim(page);
	await page.goto(path);
	await page
		.locator(ready)
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
}

/** Pages the shell's track has moved: 1.5 is halfway from tab 1 to tab 2. */
function shellPosition(page: Page) {
	return page
		.locator('[data-slot="tab-shell-track"]')
		.evaluate(
			(el) =>
				-new DOMMatrix(getComputedStyle(el).transform).m41 /
				el.clientWidth,
		);
}

/** A horizontal drag across the middle of whatever is under `selector`. */
async function drag(
	page: Page,
	selector: string,
	{ distancePx, release = true }: { distancePx: number; release?: boolean },
) {
	const box = (await page.locator(selector).first().boundingBox())!;
	const y = box.y + box.height / 2;
	const x =
		distancePx < 0 ? box.x + box.width * 0.8 : box.x + box.width * 0.2;
	const touch = await TrustedTouch.attach(page);
	await touch.drag(
		page,
		{ x, y },
		{ x: x + distancePx, y },
		{ steps: 16, holdMs: 16, release },
	);
	return touch;
}

test("on a phone the tabs are panes of one pager, the routed one on show", async ({
	page,
}) => {
	await open(page, "/right-now", `${pane("Right Now")} .pull-scroller`);

	await expect.poll(() => shellPosition(page)).toBeCloseTo(1, 2);
	await expect(page.locator(`${pane("Right Now")}[data-active]`)).toHaveCount(
		1,
	);
	await expect(page.locator("[data-tab-pane][data-active]")).toHaveCount(1);
});

test("a drag on Right Now brings Interest in under the finger, and releasing past halfway lands on it", async ({
	page,
}) => {
	await open(page, "/right-now", `${pane("Right Now")} .pull-scroller`);
	await expect.poll(() => shellPosition(page)).toBeCloseTo(1, 2);

	const width = (await page.locator(SHELL).boundingBox())!.width;
	const touch = await drag(page, `${pane("Right Now")} .pull-scroller`, {
		distancePx: -width * 0.6,
		release: false,
	});
	const held = await shellPosition(page);
	expect(held, "the pager follows the finger").toBeGreaterThan(1.2);
	expect(held).toBeLessThan(2);
	await expect(page.locator(pane("Interest"))).not.toBeEmpty();

	await touch.end();
	await expect(page).toHaveURL(/\/interest\/[a-z]+$/);
	await expect.poll(() => shellPosition(page)).toBeCloseTo(2, 2);
});

test("a swipe past Interest's first sub-tab drags Right Now in under the finger", async ({
	page,
}) => {
	await open(page, "/interest/views", '[data-slot="views-scroller"]');
	await expect.poll(() => shellPosition(page)).toBeCloseTo(2, 2);

	const touch = await drag(page, '[data-slot="views-scroller"]', {
		distancePx: 200,
		release: false,
	});
	const held = await shellPosition(page);
	expect(held, "Right Now is partly in view").toBeLessThan(1.8);
	expect(held).toBeGreaterThan(1);

	await touch.end();
	await expect(page).toHaveURL(/\/right-now$/);
	await expect.poll(() => shellPosition(page)).toBeCloseTo(1, 2);
});

test("a swipe past Inbox's Albums carries on to You", async ({ page }) => {
	await open(page, "/chat", '[data-slot="conversations-scroller"]');
	await page.getByRole("tab", { name: "Albums" }).click();
	const albums = '[data-slot="inbox-pane-albums"]';
	// Landed on Albums, not still sliding there: the drag starts from its box.
	await expect
		.poll(async () => (await page.locator(albums).boundingBox())?.x)
		.toBeCloseTo(0, 0);

	await drag(page, albums, { distancePx: -200 });

	await expect(page).toHaveURL(/\/settings$/);
	await expect.poll(() => shellPosition(page)).toBeCloseTo(4, 2);
});

test("a tab tap glides the pager to that tab", async ({ page }) => {
	await open(page, "/right-now", `${pane("Right Now")} .pull-scroller`);

	await page.getByRole("link", { name: "Inbox" }).click();

	await expect(page).toHaveURL(/\/chat$/);
	await expect.poll(() => shellPosition(page)).toBeCloseTo(3, 2);
});

test("a swipe inside Inbox pages Messages to Albums, not on to the next tab", async ({
	page,
}) => {
	await open(page, "/chat", '[data-slot="conversations-scroller"]');
	await expect.poll(() => shellPosition(page)).toBeCloseTo(3, 2);

	await drag(page, '[data-slot="conversations-scroller"]', {
		distancePx: -200,
	});

	// Resting on Albums, its last tab.
	await expect(page.locator('[data-slot="inbox-pager"]')).toHaveAttribute(
		"data-pan-last",
		"",
	);
	await expect(page).toHaveURL(/\/chat$/);
	expect(await shellPosition(page)).toBeCloseTo(3, 2);
});

test("only the tab on show and its neighbours stay mounted", async ({
	page,
}) => {
	await open(page, "/right-now", `${pane("Right Now")} .pull-scroller`);
	for (const tab of ["Interest", "Inbox", "You"])
		await page.getByRole("link", { name: tab, exact: true }).click();
	await expect(page).toHaveURL(/\/settings$/);

	const live = () =>
		page.evaluate(() =>
			Array.from(
				document.querySelectorAll<HTMLElement>("[data-tab-pane]"),
				(pane) =>
					pane.childElementCount > 0 ? pane.dataset.tabPane : null,
			).filter(Boolean),
		);
	await expect.poll(live, { timeout: 10_000 }).toEqual(["Inbox", "You"]);
});

test("swiping on to Matches leaves the app responsive", async ({ page }) => {
	await open(page, "/right-now", `${pane("Right Now")} .pull-scroller`);
	await drag(page, `${pane("Right Now")} .pull-scroller`, {
		distancePx: -240,
	});
	await expect(page).toHaveURL(/\/interest\/taps$/);
	await page.locator('[data-slot="taps-scroller"]').waitFor();

	await drag(page, '[data-slot="taps-scroller"]', { distancePx: -240 });

	await expect(page).toHaveURL(/\/interest\/matches$/);
	// A refresh that re-ran itself forever left the page unable to answer.
	const answered = await Promise.race([
		page.evaluate(() => true),
		new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
	]);
	expect(answered, "the page still answers").toBe(true);
});
