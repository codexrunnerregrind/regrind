import { expect, type Page, test } from "@playwright/test";

import { installTauriShim } from "./support/app";

const CONVERSATION = "/chat/100001:123456000";
const BUBBLE_TEXT = '[data-slot="bubble-text"]';
const REPLIABLE = "consectetur adipiscing elit";

type Bubble = {
	text: string;
	/** Space inside the bubble that no line of text reaches. */
	slack: number;
	lines: number;
	/** Lines the same text takes with the pinned width removed. */
	naturalLines: number;
	overflow: number;
};

/**
 * Measures every text bubble twice: as rendered, then with the pinned width
 * dropped, so a pin that rewrapped the text is visible as a line-count change.
 */
function measureBubbles(page: Page, selector: string): Promise<Bubble[]> {
	return page.evaluate((bubbleText) => {
		const texts = [...document.querySelectorAll(bubbleText)];
		const lineCount = (text: Element) => {
			const range = document.createRange();
			range.selectNodeContents(text);
			const tops = new Set<number>();
			for (const rect of range.getClientRects()) {
				if (rect.width > 0) tops.add(Math.round(rect.top));
			}
			return tops.size;
		};
		const widest = (text: Element) => {
			const range = document.createRange();
			range.selectNodeContents(text);
			const lines = new Map<number, { left: number; right: number }>();
			for (const rect of range.getClientRects()) {
				if (rect.width === 0) continue;
				const key = Math.round(rect.top / 4);
				const line = lines.get(key);
				lines.set(
					key,
					line
						? {
								left: Math.min(line.left, rect.left),
								right: Math.max(line.right, rect.right),
							}
						: { left: rect.left, right: rect.right },
				);
			}
			return Math.max(
				0,
				...[...lines.values()].map((line) => line.right - line.left),
			);
		};

		const measured = texts.map((text) => {
			const box = text.parentElement as HTMLElement;
			const style = getComputedStyle(box);
			const inner =
				box.getBoundingClientRect().width -
				parseFloat(style.paddingLeft) -
				parseFloat(style.paddingRight);
			return {
				text: text.textContent ?? "",
				slack: inner - widest(text),
				lines: lineCount(text),
				overflow: box.scrollWidth - box.clientWidth,
			};
		});

		const pinned = texts.map(
			(text) => (text.parentElement as HTMLElement).style.width,
		);
		for (const text of texts)
			(text.parentElement as HTMLElement).style.width = "";
		const natural = texts.map(lineCount);
		texts.forEach((text, index) => {
			(text.parentElement as HTMLElement).style.width =
				pinned[index] ?? "";
		});

		return measured.map((bubble, index) => ({
			...bubble,
			naturalLines: natural[index] ?? 0,
		}));
	}, selector);
}

async function send(page: Page, text: string) {
	const composer = page.getByRole("textbox");
	await composer.fill(text);
	await composer.press("Enter");
	await expect(page.getByText(text, { exact: true })).toBeVisible();
}

test("a wrapped bubble is no wider than its longest line", async ({ page }) => {
	await installTauriShim(page);
	await page.goto(CONVERSATION);
	await page.locator(BUBBLE_TEXT).first().waitFor({ timeout: 30_000 });

	// One that wraps with a short last line, one that wraps mid-word with no
	// spaces to break at, and one short enough to stay on a single line.
	await send(page, "Por isso seria mais fácil quando viesses por cá");
	await send(page, "Eu não costumo ir tanto para esses lado");
	await send(page, "https://example.com/a/very/long/path/that/never/breaks");
	await send(page, "curto");
	await page.waitForTimeout(200);

	const bubbles = await measureBubbles(page, BUBBLE_TEXT);
	expect(bubbles.length).toBeGreaterThan(4);

	for (const bubble of bubbles) {
		const label = JSON.stringify(bubble.text.slice(0, 40));
		expect
			.soft(bubble.slack, `${label} keeps no space past its longest line`)
			.toBeLessThan(2);
		expect
			.soft(bubble.slack, `${label} is not pinned under its own text`)
			.toBeGreaterThanOrEqual(-0.5);
		expect
			.soft(bubble.lines, `${label} wraps the same as it would unpinned`)
			.toBe(bubble.naturalLines);
		expect
			.soft(bubble.overflow, `${label} does not overflow its bubble`)
			.toBeLessThanOrEqual(1);
	}

	const wrapped = bubbles.filter((bubble) => bubble.lines > 1);
	expect(wrapped.length, "the sent messages did wrap").toBeGreaterThan(1);
});

test("a reply bubble stays wide enough for the quote it carries", async ({
	page,
}) => {
	await installTauriShim(page);
	await page.goto(CONVERSATION);
	await page.locator(BUBBLE_TEXT).first().waitFor({ timeout: 30_000 });

	await page
		.locator('[role="button"][tabindex="0"]')
		.filter({ hasText: REPLIABLE })
		.click({ button: "right" });
	await page.getByRole("button", { name: "Reply", exact: true }).click();
	await send(page, "sim");
	await page.waitForTimeout(200);

	// The quote inside a sent reply, not the composer's reply bar.
	const quote = page
		.getByRole("button", { name: /^Reply to (them|me)/ })
		.last();
	await expect(quote).toBeVisible();
	const overflow = await quote.evaluate((node) => {
		const box = node.closest("[class*='rounded-bubble']") as HTMLElement;
		return box.scrollWidth - box.clientWidth;
	});
	expect(
		overflow,
		"the quote is not squeezed out of the bubble",
	).toBeLessThanOrEqual(1);
});
