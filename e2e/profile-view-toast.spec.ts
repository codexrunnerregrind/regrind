import { expect, test } from "@playwright/test";

import { installEventInjection, installTauriShim } from "./support/app";

const TOAST = ".profile-view-toast";

test("the profile view bubble only takes taps on the pill itself", async ({
	page,
}) => {
	await installTauriShim(page);
	await installEventInjection(page);
	await page.goto("/");
	await page.locator('nav a[href="/interest"]').waitFor({ timeout: 180_000 });

	// Registration of the socket listener is async, so keep re-emitting until the
	// bubble shows rather than racing it once.
	const toast = page.locator(TOAST);
	for (
		let attempt = 0;
		attempt < 10 && (await toast.count()) === 0;
		attempt++
	) {
		await page.evaluate(() => {
			window.__emitTauriEvent?.("grindr:viewed_me_v1_new_view_received", {
				type: "viewed_me.v1.new_view_received",
				notificationId: null,
				ref: null,
				payload: {
					viewedCount: 1,
					mostRecent: {
						profileId: 100001,
						photoHash: null,
						timestamp: 1750000000000,
					},
				},
			});
		});
		await page.waitForTimeout(300);
	}
	await toast.waitFor({ timeout: 5000 });

	const probe = await toast.evaluate((li) => {
		const row = li.getBoundingClientRect();
		const pill = li.firstElementChild!.getBoundingClientRect();
		const y = Math.round(row.y + row.height / 2);
		const hit = (x: number) =>
			document.elementFromPoint(x, y)?.closest("[data-sonner-toast]") !==
			null;
		return {
			// Both flanks of the centred pill, plus the expand hit strip above it.
			besidePill:
				hit(Math.round(pill.x / 2)) || hit(Math.round(row.right - 4)),
			abovePill:
				document
					.elementFromPoint(
						Math.round(row.x + 4),
						Math.round(row.y - 4),
					)
					?.closest("[data-sonner-toast]") !== null,
			onPill: hit(Math.round(pill.x + pill.width / 2)),
		};
	});

	expect(probe.besidePill, "row beside the pill swallows taps").toBe(false);
	expect(probe.abovePill, "strip above the pill swallows taps").toBe(false);
	expect(probe.onPill, "the pill itself is tappable").toBe(true);

	await toast.getByText("viewed your profile").click();
	await expect(page).toHaveURL(/\/interest\/views$/);
});
