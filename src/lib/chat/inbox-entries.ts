import type { Conversation } from "$lib/model/messaging/conversations";

/** Pinned first, then newest activity — the order the inbox is read in. */
export function sortConversations(entries: Conversation[]): Conversation[] {
	return entries.toSorted(
		(a, b) =>
			Number(b.data.pinned) - Number(a.data.pinned) ||
			b.data.lastActivityTimestamp - a.data.lastActivityTimestamp,
	);
}

/**
 * Fold a freshly fetched conversation into the one already on screen, keeping
 * what we know better than the server does: a flag whose request is still in
 * flight, and the unread count of the conversation being read right now.
 */
export function mergeIntoExisting({
	existing,
	incoming,
	pendingFields,
	activeConversationId,
}: {
	existing: Conversation;
	incoming: Conversation;
	pendingFields: (keyof Conversation["data"])[];
	activeConversationId: string | null;
}): void {
	const { unreadCount, ...data } = incoming.data;
	for (const field of pendingFields) {
		Object.assign(data, { [field]: existing.data[field] });
	}
	Object.assign(existing.data, data);
	if (incoming.data.conversationId !== activeConversationId) {
		existing.data.unreadCount = unreadCount;
	}
}
