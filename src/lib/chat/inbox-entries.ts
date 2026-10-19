import type { Conversation } from "$lib/model/messaging/conversations";

/** Pinned first, then newest activity — the order the inbox is read in. */
export function sortConversations(entries: Conversation[]): Conversation[] {
	return entries.toSorted(
		(a, b) =>
			Number(b.data.pinned) - Number(a.data.pinned) ||
			b.data.lastActivityTimestamp - a.data.lastActivityTimestamp,
	);
}
