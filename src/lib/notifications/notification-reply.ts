import { sendMessage } from "#lib/api/messaging/messages.ts";

// Conversation ids are the two profile ids joined by a colon.
export function peerIdFromConversation(
	conversationId: string,
	ourProfileId: number,
): number | null {
	const ids = conversationId.split(":").map(Number);
	if (ids.length !== 2 || ids.some((id) => !Number.isSafeInteger(id)))
		return null;
	const peer = ids.find((id) => id !== ourProfileId);
	return peer ?? null;
}

/** Sends a text typed into a notification's reply field. Returns whether it went out. */
export async function sendNotificationReply(
	conversationId: string,
	text: string,
	ourProfileId: number,
): Promise<boolean> {
	const trimmed = text.trim();
	const peer = peerIdFromConversation(conversationId, ourProfileId);
	if (!trimmed || peer === null) return false;
	try {
		await sendMessage({
			toUserId: peer,
			message: { type: "Text", body: { text: trimmed } },
		});
		return true;
	} catch (error) {
		console.error("[notifications] reply failed", error);
		return false;
	}
}
