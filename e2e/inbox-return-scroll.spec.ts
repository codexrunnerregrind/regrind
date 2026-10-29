import { expect, test } from "@playwright/test";

import { FIRST_ROUTE_COMPILE_MS, installTauriShim } from "./support/app";

const ME = 123456000;
const CONVERSATIONS_MODULE_URL =
	"/src/lib/chat/conversations-context.svelte.ts";
const SCROLLER = '[data-slot="conversations-scroller"]';
const PLACEHOLDER = '[data-slot="conversation-placeholder"]';
const LATER_CONVERSATIONS = 80;
const SCROLLED_TO = 4000;

test.describe.configure({ timeout: 300_000 });

test("back from a profile, a deep inbox paints first at the row it was left on and stays there", async ({
	page,
}) => {
	await installTauriShim(page);
	await page.goto("/chat");
	await page
		.locator(`${SCROLLER} a[href^="/chat/"]`)
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await page.evaluate(
		async ({ module, me, count }) => {
			const { getOrCreateConversationsState } = await import(module);
			const conversations = getOrCreateConversationsState(me);
			const template = conversations.entries.at(-1);
			for (let copy = 1; copy <= count; copy++) {
				const later = JSON.parse(JSON.stringify(template)) as {
					data: { conversationId: string };
				};
				later.data.conversationId = `${900000 + copy}:${me}`;
				conversations.entries.push(later);
			}
		},
		{
			module: CONVERSATIONS_MODULE_URL,
			me: ME,
			count: LATER_CONVERSATIONS,
		},
	);
	await expect(page.locator(PLACEHOLDER)).toHaveCount(0);

	const left = await page.locator(SCROLLER).evaluate((scroller, top) => {
		scroller.scrollTop = top;
		const box = scroller.getBoundingClientRect();
		const row = [
			...scroller.querySelectorAll<HTMLAnchorElement>(
				'a[href^="/chat/"]',
			),
		].find((link) => link.getBoundingClientRect().top > box.top + 60)!;
		return {
			href: row.getAttribute("href")!,
			top: row.getBoundingClientRect().top,
		};
	}, SCROLLED_TO);

	// A scripted click: Playwright's own scrolls the link into view first.
	await page
		.locator(`${SCROLLER} a[href^="/profile/"]`)
		.filter({ visible: true })
		.first()
		.evaluate((link: HTMLAnchorElement) => link.click());
	await expect(page).toHaveURL(/\/profile\//);

	// Every frame from the list's return on, before it paints.
	await page.evaluate(
		({ scrollerSelector, href }) => {
			const frames: { scrollTop: number; top: number | null }[] = [];
			Object.assign(window, { inboxFrames: frames });
			requestAnimationFrame(function sample() {
				const scroller = document.querySelector(scrollerSelector);
				if (scroller) {
					const row = scroller.querySelector(`a[href="${href}"]`);
					frames.push({
						scrollTop: scroller.scrollTop,
						top: row ? row.getBoundingClientRect().top : null,
					});
				}
				if (frames.length < 90) requestAnimationFrame(sample);
			});
		},
		{ scrollerSelector: SCROLLER, href: left.href },
	);
	await page.goBack();
	await expect(page.locator(PLACEHOLDER)).toHaveCount(0);
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as { inboxFrames: unknown[] })
						.inboxFrames.length,
			),
		)
		.toBe(90);

	// The frame callback that samples runs ahead of the restore's within a
	// frame, so the first sample may still read the top; the paint after both
	// does not.
	const frames = await page.evaluate(
		() =>
			(
				window as unknown as {
					inboxFrames: { scrollTop: number; top: number | null }[];
				}
			).inboxFrames,
	);
	const painted = frames.slice(1);
	expect(
		painted.map(({ scrollTop }) => scrollTop),
		"the list never shows another offset",
	).toEqual(painted.map(() => SCROLLED_TO));
	expect(
		painted.map(({ top }) => top),
		"the row it was left on never moves",
	).toEqual(painted.map(() => left.top));
});
