import { expect, test } from "@playwright/test";

import { DEMO_CONVERSATION, installTauriShim } from "./support/app";

/**
 * Every button in the app carries `transition-all` from its base styles, which
 * quietly animates any transform written onto one. For a transform driven by a
 * finger that is fatal: each pointer frame restarts the animation from wherever
 * the last one had reached, so the control never arrives anywhere and reads as a
 * shake. Nothing about it shows up in the DOM — the inline transform looks
 * perfectly sensible — so the only way to catch it is to watch where the pixels
 * actually are, frame by frame, and insist they only move when we move them.
 */
test("the recording controls follow the drag rather than easing after it", async ({
	page,
}) => {
	await installTauriShim(page);
	await page.addInitScript(() => {
		class FakeRecorder {
			static isTypeSupported() {
				return true;
			}
			ondataavailable: ((event: { data: Blob }) => void) | null = null;
			onstop: (() => void) | null = null;
			onerror: ((event: unknown) => void) | null = null;
			mimeType = "audio/mp4";
			start() {}
			stop() {
				this.ondataavailable?.({
					data: new Blob(["clip"], { type: "audio/mp4" }),
				});
				this.onstop?.();
			}
		}
		(window as unknown as { MediaRecorder: unknown }).MediaRecorder =
			FakeRecorder;
		Object.defineProperty(navigator, "mediaDevices", {
			value: {
				getUserMedia: () =>
					Promise.resolve({ getTracks: () => [{ stop: () => {} }] }),
			},
			configurable: true,
		});
	});
	await page.goto(DEMO_CONVERSATION);

	const mic = page.getByRole("button", { name: "Record voice message" });
	await mic.waitFor();
	const box = (await mic.boundingBox())!;
	const startX = box.x + box.width / 2;
	const y = box.y + box.height / 2;

	await page.mouse.move(startX, y);
	await page.mouse.down();
	await expect(page.getByLabel("Discard recording")).toBeVisible();

	await page.evaluate(() => {
		const frames: { transform: string; x: number; scale: string }[] = [];
		(window as unknown as { __frames: typeof frames }).__frames = frames;
		const tick = () => {
			const micEl = document.querySelector(
				'[aria-label="Record voice message"]',
			);
			const binEl = document.querySelector(
				'[aria-label="Discard recording"]',
			);
			if (micEl instanceof HTMLElement && binEl instanceof HTMLElement)
				frames.push({
					transform: micEl.style.transform,
					x: Math.round(micEl.getBoundingClientRect().x * 100) / 100,
					scale: binEl.style.transform,
				});
			if (frames.length < 400) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});

	// A slow, dense, strictly leftward drag — a finger, near enough.
	for (let step = 1; step <= 80; step++) {
		await page.mouse.move(startX - step, y);
		await page.waitForTimeout(8);
	}
	await page.mouse.up();

	const frames = await page.evaluate(
		() =>
			(
				window as unknown as {
					__frames: { transform: string; x: number; scale: string }[];
				}
			).__frames,
	);
	const dragging = frames.filter((frame) => frame.transform !== "");
	expect(dragging.length).toBeGreaterThan(30);

	// The mic ends up left of where it started, and never once doubles back.
	expect(dragging.at(-1)!.x).toBeLessThan(dragging[0]!.x);
	const reversals = dragging.filter((frame, index) => {
		if (index < 2) return false;
		const before = dragging[index - 1]!.x - dragging[index - 2]!.x;
		const after = frame.x - dragging[index - 1]!.x;
		return (
			before !== 0 &&
			after !== 0 &&
			Math.sign(before) !== Math.sign(after)
		);
	});
	expect(reversals).toHaveLength(0);

	// And the giveaway: a frame that moves while the transform written to it has
	// not changed is a frame somebody else is animating.
	const drifting = dragging.filter(
		(frame, index) =>
			index > 0 &&
			frame.transform === dragging[index - 1]!.transform &&
			Math.abs(frame.x - dragging[index - 1]!.x) > 0.01,
	);
	expect(drifting).toHaveLength(0);
});
