import {
	chatV1CacheBombInboxEventSchema,
	chatV1ConversationDeleteEventSchema,
	chatV1ConversationUpdateEventSchema,
	chatV1MessageDeletedEventSchema,
	chatV1MessageSentEventSchema,
	chatV1RefreshDynamicEventSchema,
	chatV1TypingStatusEventSchema,
	ws,
} from "$lib/ws.svelte";
import type { ApiResponseMessage } from "$lib/model/messaging/messages";
import type { TypingStatus } from "$lib/ws.svelte";
import { deletedConversationIds } from "./message-deleted";

/**
 * What the inbox does with each realtime event. Split out from the state itself
 * so the mapping from event to intent reads in one place, and so the state is
 * left holding only the doing.
 */
export type InboxRealtimeTarget = {
	/** Called before every handler; `false` drops the event. */
	alive: () => boolean;
	onMessageSent: (message: ApiResponseMessage) => void;
	onConversationsDeleted: (conversationIds: string[]) => void;
	onConversationsUpdated: (conversationIds: string[]) => void;
	/** The server says the inbox we hold is stale, without saying how. */
	onInboxStale: () => void;
	/** A share, unshare, re-date or view on an album already sent. */
	onAlbumChanged: (conversationId: string) => void;
	/**
	 * A hard delete. The ids are the conversations it names — empty when the
	 * (undocumented) payload names none we recognise.
	 */
	onMessagesDeleted: (conversationIds: string[]) => void;
	onTyping: (status: {
		conversationId: string;
		profileId: number;
		status: TypingStatus;
	}) => void;
};

/** Subscribe the inbox to the realtime socket. Unlisten with every promise. */
export function subscribeInboxRealtime(
	target: InboxRealtimeTarget,
): Promise<() => void>[] {
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
			guard(target.onMessageSent),
		),
		ws.on(
			"chat.v1.conversation.delete",
			chatV1ConversationDeleteEventSchema,
			guard(({ conversationIds }) =>
				target.onConversationsDeleted(conversationIds),
			),
		),
		// Metadata only — favorite, muted, pinned, the peer's name or photo.
		ws.on(
			"chat.v1.conversation.update",
			chatV1ConversationUpdateEventSchema,
			guard(({ conversationIds }) =>
				target.onConversationsUpdated(conversationIds),
			),
		),
		ws.on(
			"chat.v1.cache_bomb.inbox",
			chatV1CacheBombInboxEventSchema,
			guard(() => target.onInboxStale()),
		),
		ws.on(
			"chat.v1.refresh_dynamic",
			chatV1RefreshDynamicEventSchema,
			guard(({ conversationId }) =>
				target.onAlbumChanged(conversationId),
			),
		),
		ws.on(
			"chat.v1.message_deleted",
			chatV1MessageDeletedEventSchema,
			guard((payload) =>
				target.onMessagesDeleted(deletedConversationIds(payload)),
			),
		),
		ws.on(
			"chat.v1.typing_status",
			chatV1TypingStatusEventSchema,
			guard((payload) => target.onTyping(payload)),
		),
	];
}
