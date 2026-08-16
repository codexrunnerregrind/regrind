import type { CachedConversation } from "./cached-conversation";

/**
 * A conversation's already-loaded messages, kept so reopening it paints from
 * memory instead of an empty list. Held outside the reactive state on purpose:
 * it is read imperatively when a conversation screen mounts, never from a
 * template or a `$derived`.
 */
export class MessageCache {
	#entries = new Map<string, CachedConversation>();

	get(id: string): CachedConversation | undefined {
		return this.#entries.get(id);
	}

	set(id: string, data: CachedConversation): void {
		this.#entries.set(id, data);
	}

	delete(id: string): void {
		this.#entries.delete(id);
	}

	/** Drop every conversation but the one on screen. */
	keepOnly(id: string | null): void {
		for (const cached of [...this.#entries.keys()]) {
			if (cached !== id) this.#entries.delete(cached);
		}
	}
}
