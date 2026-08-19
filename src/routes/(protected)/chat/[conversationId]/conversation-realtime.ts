import {
	chatV1ConversationDeleteEventSchema,
	chatV1ConversationReadEventSchema,
	chatV1ConversationUpdateEventSchema,
	chatV1MessageDeletedEventSchema,
	chatV1MessageSentEventSchema,
	chatV1RefreshDynamicEventSchema,
	ws,
} from "$lib/ws.svelte";
import type { ApiResponseMessage } from "$lib/model/messaging/messages";
import type { ChatV1MessageDeletedEventPayload } from "$lib/ws.svelte";

/**
 * What an open conversation does with each realtime event. Split out from the
 * state so that deciding which events are ours — and which of them mean the
 * same thing — reads in one place.
 */
export type ConversationRealtimeTarget = {
	conversationId: string;
	/** Called before every handler; `false` drops the event. */
	alive: () => boolean;
	onMessageSent: (message: ApiResponseMessage) => void;
	onReadReceipt: (receipt: { profileId: number; timestamp: number }) => void;
	/**
	 * Something we can only learn by refetching changed: the conversation was
	 * deleted, its metadata moved, or an album bubble in it no longer says what
	 * it said when it was sent.
	 */
	onStale: () => void;
	/** A hard delete, as opposed to the unsend that arrives as a message. */
	onMessagesDeleted: (
		payload: ChatV1MessageDeletedEventPayload["payload"],
	) => void;
};

/** Subscribe an open conversation to the realtime socket. */
export function subscribeConversationRealtime(
	target: ConversationRealtimeTarget,
): Promise<() => void>[] {
	const ours = (conversationId: string) =>
		conversationId === target.conversationId;
	const guard =
		<T>(handle: (payload: T) => void) =>
		(event: { payload: T }) => {
			if (!target.alive()) return;
			handle(event.payload);
		};

	return [
		ws.on(
			"chat.v1.message_sent",
			chatV1MessageSentEventSchema,
			guard((message) => {
				if (ours(message.conversationId)) target.onMessageSent(message);
			}),
		),
		ws.on(
			"chat.v1.conversation_read",
			chatV1ConversationReadEventSchema,
			guard(({ conversationId, profileId, timestamp }) => {
				if (ours(conversationId))
					target.onReadReceipt({ profileId, timestamp });
			}),
		),
		ws.on(
			"chat.v1.conversation.delete",
			chatV1ConversationDeleteEventSchema,
			guard(({ conversationIds }) => {
				if (conversationIds.some(ours)) target.onStale();
			}),
		),
		ws.on(
			"chat.v1.conversation.update",
			chatV1ConversationUpdateEventSchema,
			guard(({ conversationIds }) => {
				if (conversationIds.some(ours)) target.onStale();
			}),
		),
		ws.on(
			"chat.v1.refresh_dynamic",
			chatV1RefreshDynamicEventSchema,
			guard(({ conversationId }) => {
				if (ours(conversationId)) target.onStale();
			}),
		),
		// Which conversation a delete names is left to the target: an event that
		// names none still has to be acted on rather than filtered away.
		ws.on(
			"chat.v1.message_deleted",
			chatV1MessageDeletedEventSchema,
			guard((payload) => target.onMessagesDeleted(payload)),
		),
	];
}
