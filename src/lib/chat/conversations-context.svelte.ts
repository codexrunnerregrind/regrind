import { createContext } from "svelte";

import { registerAccountCache } from "$lib/api/account-caches";
import { ConversationsState } from "./conversations-state.svelte";

export const [getConversations, setConversations] =
	createContext<ConversationsState>();

let cachedState: ConversationsState | null = null;
let cachedProfileId: number | null = null;

/**
 * Return the already-created conversations state, or `null` if none exists yet.
 * Unlike {@link getOrCreateConversationsState} this never constructs one (and so
 * never triggers a network load), which makes it safe for passive readers such as
 * the notification service.
 */
export function peekConversationsState(): ConversationsState | null {
	return cachedState;
}

export function getOrCreateConversationsState(
	profileId: number,
): ConversationsState {
	if (cachedState !== null && cachedProfileId === profileId) {
		return cachedState;
	}
	if (cachedState !== null) {
		void cachedState.destroy();
	}
	cachedState = new ConversationsState(profileId);
	cachedProfileId = profileId;
	return cachedState;
}

registerAccountCache(() => {
	void cachedState?.destroy();
	cachedState = null;
	cachedProfileId = null;
});
