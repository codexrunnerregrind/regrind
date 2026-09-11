import type { Conversation } from "$lib/model/messaging/conversations";

/**
 * The flags the server withholds from a conversation past the free tier's
 * display cap. A filtered page looks past that cap, so it comes back mixing
 * full entries with partial ones whose flags all read "off".
 */
type GatedFlags = Pick<
	Conversation["data"],
	"muted" | "pinned" | "favorite" | "rightNow" | "hasUnreadThrob"
>;

export function flagsOf(data: Conversation["data"]): GatedFlags {
	const { muted, pinned, favorite, rightNow, hasUnreadThrob } = data;
	return { muted, pinned, favorite, rightNow, hasUnreadThrob };
}

/**
 * Carries what a full entry said about a conversation over to the partial
 * entries that follow it, so filtering does not visibly unpin, unmute or
 * unfavorite a row the account simply cannot be told about any more.
 *
 * Seeding is once per entry object: after that the row belongs to the list,
 * which may unpin it, and a later page must not put the pin back.
 */
export class RememberedConversationFlags {
	#byConversation = new Map<string, GatedFlags>();
	#seeded = new WeakSet<Conversation>();

	applyTo(entries: Iterable<Conversation>): void {
		for (const entry of entries) {
			const { conversationId } = entry.data;
			if (
				entry.type === "partial_conversation_v1" &&
				!this.#seeded.has(entry)
			) {
				this.#seeded.add(entry);
				const known = this.#byConversation.get(conversationId);
				if (known) Object.assign(entry.data, known);
			}
			this.#byConversation.set(conversationId, flagsOf(entry.data));
		}
	}
}
