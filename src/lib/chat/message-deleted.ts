import type { ChatV1MessageDeletedEventPayload } from "$lib/ws.svelte";

type DeletedPayload = ChatV1MessageDeletedEventPayload["payload"];

function present<T>(value: T | null | undefined): T[] {
	return value === null || value === undefined ? [] : [value];
}

/**
 * `chat.v1.message_deleted` has an undocumented payload, and the two shapes the
 * other chat events use — one id, or an array of them — are the ones it is
 * likely to take. Read both, and let an empty result mean "we cannot tell which,
 * so refetch" rather than "none".
 */
export function deletedConversationIds(payload: DeletedPayload): string[] {
	return [
		...present(payload.conversationId),
		...(payload.conversationIds ?? []),
	];
}

export function deletedMessageIds(payload: DeletedPayload): string[] {
	return [...present(payload.messageId), ...(payload.messageIds ?? [])];
}
