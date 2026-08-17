import { getNow } from "$lib/util/now";
import type { InboxFilterRequest } from "$lib/api/messaging/conversations";
import type { Conversation } from "$lib/model/messaging/conversations";

export const CONVERSATION_FILTER_KEYS = [
	"favorites",
	"unread",
	"online",
] as const;

export type ConversationFilterKey = (typeof CONVERSATION_FILTER_KEYS)[number];

const matchers: Record<
	ConversationFilterKey,
	(conversation: Conversation) => boolean
> = {
	favorites: (conversation) => conversation.data.favorite,
	// Muting silences a conversation's notifications, not its unread count — the
	// filter shows muted threads with unread messages like any other.
	unread: (conversation) => conversation.data.unreadCount > 0,
	// The same reading the row's own status dot takes, so the filter keeps
	// exactly the conversations showing one. `getNow` ticks, so a thread that
	// goes offline drops out of a filtered list on its own.
	online: (conversation) =>
		(conversation.data.onlineUntil ??
			conversation.data.participants[0]?.onlineUntil ??
			0) > getNow(),
};

export function inboxFilterRequest(
	active: ConversationFilterKey[],
): InboxFilterRequest | null {
	if (active.length === 0) return null;
	return {
		unreadOnly: active.includes("unread"),
		chemistryOnly: false,
		favoritesOnly: active.includes("favorites"),
		rightNowOnly: false,
		onlineNowOnly: active.includes("online"),
		distanceMeters: null,
		positions: [],
	};
}

export class ConversationFilters {
	active = $state<ConversationFilterKey[]>([]);

	matches(conversation: Conversation): boolean {
		return this.active.every((key) => matchers[key](conversation));
	}

	set(active: ConversationFilterKey[]): boolean {
		const unchanged =
			active.length === this.active.length &&
			active.every((key) => this.active.includes(key));
		if (unchanged) return false;
		this.active = active;
		return true;
	}
}

export function applyFavoriteEdit({
	entries,
	profileId,
	isFavorite,
}: {
	entries: Conversation[];
	profileId: number;
	isFavorite: boolean;
}): void {
	const entry = entries.find(
		(candidate) => candidate.data.participants[0]?.profileId === profileId,
	);
	if (entry) entry.data.favorite = isFavorite;
}
