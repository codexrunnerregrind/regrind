import { FilterPosition } from "$lib/model/browse/grid/filters";
import { getNow } from "$lib/util/now";
import type { InboxFilterRequest } from "$lib/api/messaging/conversations";
import type { FilterPositionId } from "$lib/model/browse/grid/filters";
import type { Conversation } from "$lib/model/messaging/conversations";

export const CONVERSATION_FILTER_KEYS = [
	"favorites",
	"unread",
	"online",
	"rightNow",
] as const;

export type ConversationFilterKey = (typeof CONVERSATION_FILTER_KEYS)[number];

/**
 * Everything the inbox can be narrowed by: the three on/off pills, plus the two
 * that carry a value of their own and so open a sheet rather than toggling.
 */
export type ConversationFilterSelection = {
	active: ConversationFilterKey[];
	/** A ceiling, in metres; `null` while the distance filter is off. */
	distanceMetres: number | null;
	/** Empty while the position filter is off. */
	positions: FilterPositionId[];
};

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
	// Hosting or not, either counts as being up for something right now.
	rightNow: (conversation) => conversation.data.rightNow !== "NOT_ACTIVE",
};

// A conversation the server sends without a distance cannot be shown to be
// within one, so a distance ceiling drops it — the same call the online filter
// makes for a thread with no status.
function withinDistance(
	conversation: Conversation,
	distanceMetres: number,
): boolean {
	const distance = conversation.data.participants[0]?.distanceMetres;
	return distance !== null && distance !== undefined
		? distance <= distanceMetres
		: false;
}

// "Not specified" is a position in the filter, so a participant who published
// none matches it and nothing else.
function matchesPosition(
	conversation: Conversation,
	positions: FilterPositionId[],
): boolean {
	const position = conversation.data.participants[0]?.position ?? null;
	return positions.includes(
		position === null ? FilterPosition.NotSpecified : position,
	);
}

export function inboxFilterRequest(
	selection: ConversationFilterSelection,
): InboxFilterRequest | null {
	const { active, distanceMetres, positions } = selection;
	if (
		active.length === 0 &&
		distanceMetres === null &&
		positions.length === 0
	)
		return null;
	return {
		unreadOnly: active.includes("unread"),
		chemistryOnly: false,
		favoritesOnly: active.includes("favorites"),
		rightNowOnly: active.includes("rightNow"),
		onlineNowOnly: active.includes("online"),
		distanceMeters: distanceMetres,
		positions: [...positions],
	};
}

export class ConversationFilters {
	active = $state<ConversationFilterKey[]>([]);
	distanceMetres = $state<number | null>(null);
	positions = $state<FilterPositionId[]>([]);

	/** Whether the list is narrowed at all — nothing to filter locally if not. */
	get any(): boolean {
		return (
			this.active.length > 0 ||
			this.distanceMetres !== null ||
			this.positions.length > 0
		);
	}

	// Only the unread filter (or none) is on, so a chat dropping out was read.
	get dropsOnlyReadChats(): boolean {
		return (
			this.active.every((key) => key === "unread") &&
			this.distanceMetres === null &&
			this.positions.length === 0
		);
	}

	snapshot(): ConversationFilterSelection {
		return {
			active: [...this.active],
			distanceMetres: this.distanceMetres,
			positions: [...this.positions],
		};
	}

	matches(conversation: Conversation): boolean {
		if (!this.active.every((key) => matchers[key](conversation)))
			return false;
		if (
			this.distanceMetres !== null &&
			!withinDistance(conversation, this.distanceMetres)
		)
			return false;
		if (
			this.positions.length > 0 &&
			!matchesPosition(conversation, this.positions)
		)
			return false;
		return true;
	}

	set(selection: Partial<ConversationFilterSelection>): boolean {
		const active = selection.active ?? this.active;
		const distanceMetres =
			selection.distanceMetres === undefined
				? this.distanceMetres
				: selection.distanceMetres;
		const positions = selection.positions ?? this.positions;
		const unchanged =
			active.length === this.active.length &&
			active.every((key) => this.active.includes(key)) &&
			distanceMetres === this.distanceMetres &&
			positions.length === this.positions.length &&
			positions.every((position) => this.positions.includes(position));
		if (unchanged) return false;
		this.active = [...active];
		this.distanceMetres = distanceMetres;
		this.positions = [...positions];
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
