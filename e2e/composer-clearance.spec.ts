import { expect, type Page, test } from "@playwright/test";

import { DEMO_CONVERSATION, installTauriShim } from "./support/app";

const MULTILINE_TEXT =
	"one two three four five six seven eight nine ten eleven twelve thirteen " +
	"fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone";

/** px between the newest message and the composer, from the list's pb-1.5 */
const GAP_PX = 6;

const MESSAGE = '[role="button"][tabindex="0"]';

type Metrics = {
	composerHeight: number;
	composerTop: number;
	scrollTop: number;
	floorDistance: number;
	newestMessageBottom: number;
	middleMessageTop: number;
	refreshBottom: number;
};

async function openConversation(page: Page) {
	await installTauriShim(page);
	await page.goto(DEMO_CONVERSATION);
	await page.locator(MESSAGE).first().waitFor({ timeout: 30_000 });
	await page.waitForTimeout(600);
}

function measure(page: Page): Promise<Metrics> {
	return page.evaluate((message) => {
		const scroller = document.querySelector<HTMLElement>(
			'[data-slot="messages-scroller"]',
		);
		if (!scroller) throw new Error("messages scroller not found");
		const form = document.querySelector("form");
		if (!form) throw new Error("composer form not found");
		const messages = [...scroller.querySelectorAll(message)];
		const newest = messages.at(-1);
		const middle = messages[Math.floor(messages.length / 2)];
		if (!newest || !middle) throw new Error("no messages rendered");
		const refresh = scroller.parentElement?.querySelector<HTMLElement>(
			"[data-refresh-phase]",
		);
		return {
			composerHeight: form.offsetHeight,
			composerTop: form.getBoundingClientRect().top,
			scrollTop: scroller.scrollTop,
			floorDistance:
				scroller.scrollHeight -
				scroller.clientHeight -
				scroller.scrollTop,
			newestMessageBottom: newest.getBoundingClientRect().bottom,
			middleMessageTop: middle.getBoundingClientRect().top,
			refreshBottom: refresh
				? parseFloat(getComputedStyle(refresh).bottom)
				: NaN,
		};
	}, MESSAGE);
}

/**
 * The whole point of the layout: the newest message sits just above the
 * composer, never under it. Half a pixel of slack for subpixel layout.
 */
function expectClearsComposer(m: Metrics) {
	expect(
		m.composerTop - m.newestMessageBottom,
		"newest message clears the composer",
	).toBeGreaterThan(GAP_PX - 0.5);
	expect(
		m.composerTop - m.newestMessageBottom,
		"and rests against it rather than floating well above",
	).toBeLessThan(GAP_PX + 24);
}

const scrollTo = (page: Page, where: "floor" | "middle") =>
	page.evaluate((target) => {
		const scroller = document.querySelector<HTMLElement>(
			'[data-slot="messages-scroller"]',
		)!;
		const max = scroller.scrollHeight - scroller.clientHeight;
		scroller.scrollTop = target === "floor" ? max : Math.round(max / 2);
	}, where);

test.describe("messages list clears the composer", () => {
	test("the newest message clears the composer at any composer height", async ({
		page,
	}) => {
		await openConversation(page);
		await scrollTo(page, "floor");
		await page.waitForTimeout(200);
		const collapsed = await measure(page);
		expectClearsComposer(collapsed);
		// The composer is in the flow, so the refresh control needs no offset.
		expect(collapsed.refreshBottom).toBe(0);

		await page.locator("textarea").fill(MULTILINE_TEXT);
		await expect
			.poll(async () => (await measure(page)).composerHeight)
			.toBeGreaterThan(collapsed.composerHeight);

		expectClearsComposer(await measure(page));
	});

	test("at the floor, a growing composer pushes messages up", async ({
		page,
	}) => {
		await openConversation(page);
		await scrollTo(page, "floor");
		await page.waitForTimeout(200);
		const before = await measure(page);
		expect(before.floorDistance).toBeLessThanOrEqual(1);

		await page.locator("textarea").fill(MULTILINE_TEXT);
		await expect
			.poll(async () => (await measure(page)).composerHeight)
			.toBeGreaterThan(before.composerHeight);
		const grown = await measure(page);

		const growth = grown.composerHeight - before.composerHeight;
		expect(
			before.newestMessageBottom - grown.newestMessageBottom,
			"messages rise by exactly the composer's growth",
		).toBeCloseTo(growth, 1);
		expect(
			grown.floorDistance,
			"still resting on the floor",
		).toBeLessThanOrEqual(1);

		await page.locator("textarea").fill("");
		await expect
			.poll(async () => (await measure(page)).composerHeight)
			.toBe(before.composerHeight);
		const collapsed = await measure(page);
		expect(collapsed.newestMessageBottom).toBeCloseTo(
			before.newestMessageBottom,
			1,
		);
		expect(collapsed.floorDistance).toBeLessThanOrEqual(1);
	});

	test("scrolled up, a growing composer does not move the view", async ({
		page,
	}) => {
		await openConversation(page);
		await scrollTo(page, "middle");
		await page.waitForTimeout(200);
		const before = await measure(page);
		expect(before.floorDistance).toBeGreaterThan(32);

		await page.locator("textarea").fill(MULTILINE_TEXT);
		await expect
			.poll(async () => (await measure(page)).composerHeight)
			.toBeGreaterThan(before.composerHeight);
		const grown = await measure(page);

		expect(grown.scrollTop, "scroll position untouched").toBeCloseTo(
			before.scrollTop,
			1,
		);
		expect(grown.middleMessageTop, "no visual jump").toBeCloseTo(
			before.middleMessageTop,
			1,
		);
	});

	test("a conversation opens with its newest message clear of the composer", async ({
		page,
	}) => {
		// No typing, no scrolling: the layout has to be right from the first
		// paint, which is exactly what a measured-then-padded composer got wrong.
		await openConversation(page);
		expectClearsComposer(await measure(page));
	});
});
