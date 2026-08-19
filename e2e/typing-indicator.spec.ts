import { expect, type Page, test } from "@playwright/test";

import { installEventInjection, installTauriShim } from "./support/app";

const CONVERSATION = "/chat/100001:123456000";
const CONVERSATION_ID = "100001:123456000";
const ME = 123456000;
const THEM = 100001;
const MESSAGE_ROW = '[role="button"][tabindex="0"]';
const TYPING = '[data-slot="conversation-typing"]';

async function emitTyping(
	page: Page,
	{ profileId, status }: { profileId: number; status: string },
): Promise<void> {
	await page.evaluate(
		({ conversationId, profileId: id, status: value }) => {
			window.__emitTauriEvent?.("grindr:chat_v1_typing_status", {
				type: "chat.v1.typing_status",
				notificationId: null,
				ref: null,
				payload: { conversationId, profileId: id, status: value },
			});
		},
		{ conversationId: CONVERSATION_ID, profileId, status },
	);
}

test("the chat says when the other side is typing, and stops when they stop", async ({
	page,
}) => {
	await installTauriShim(page);
	await installEventInjection(page);
	await page.goto(CONVERSATION);
	await page.locator(MESSAGE_ROW).first().waitFor({ timeout: 60_000 });

	await expect(page.locator(TYPING)).toHaveCount(0);

	await emitTyping(page, { profileId: THEM, status: "Typing" });
	await expect(page.locator(TYPING).first()).toHaveText("Typing…");

	await emitTyping(page, { profileId: THEM, status: "Cleared" });
	await expect(page.locator(TYPING)).toHaveCount(0);
});

test("the inbox row says when the other side is typing", async ({ page }) => {
	await installTauriShim(page);
	await installEventInjection(page);
	await page.goto("/chat");
	await page
		.locator(`a[href="${CONVERSATION}"]`)
		.first()
		.waitFor({ timeout: 60_000 });

	await emitTyping(page, { profileId: THEM, status: "Typing" });
	await expect(page.locator(TYPING).first()).toHaveText("Typing…");
});

// Our own typing, echoed back from another device, is not news to show
// ourselves — and would sit on our own row until it expired.
test("our own typing is not shown back to us", async ({ page }) => {
	await installTauriShim(page);
	await installEventInjection(page);
	await page.goto(CONVERSATION);
	await page.locator(MESSAGE_ROW).first().waitFor({ timeout: 60_000 });

	await emitTyping(page, { profileId: ME, status: "Typing" });
	await page.waitForTimeout(500);

	await expect(page.locator(TYPING)).toHaveCount(0);
});
