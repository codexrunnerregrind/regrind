import { createContext } from "svelte";

import { accountScoped } from "$lib/api/account-caches";
import { showIncomingMessageToast } from "$lib/components/incoming-message-toast/incoming-message-toast-manager";
import { ConversationsState } from "./conversations-state.svelte";

export const [getConversations, setConversations] =
	createContext<ConversationsState>();

export const getOrCreateConversationsState = accountScoped(
	(profileId) =>
		new ConversationsState({
			ourProfileId: profileId,
			onIncomingMessage: ({ message, conversation }) =>
				showIncomingMessageToast({
					message,
					sender: {
						name: conversation.data.name,
						avatarMediaHash:
							conversation.data.participants[0]
								?.primaryMediaHash ?? null,
					},
					conversationId: conversation.data.conversationId,
				}),
		}),
);

/**
 * Return the already-created conversations state, or `null` if none exists yet.
 * Unlike {@link getOrCreateConversationsState} this never constructs one (and so
 * never triggers a network load), which makes it safe for passive readers such as
 * the notification service.
 */
export function peekConversationsState(): ConversationsState | null {
	return getOrCreateConversationsState.peek();
}
