import { SvelteMap, SvelteSet } from "svelte/reactivity";

import type { TypingStatus } from "$lib/ws.svelte";

/**
 * How long a `Typing` notice stands on its own. The server sends `Cleared` or
 * `Sent` when someone stops, but a dropped socket or a peer who closes the app
 * mid-word would otherwise leave the indicator up forever, so every notice
 * carries its own expiry and a still-typing peer keeps renewing it.
 */
export const TYPING_EXPIRY_MS = 10_000;

function key(conversationId: string, profileId: number): string {
	return `${conversationId}:${profileId}`;
}

/**
 * Who is currently typing, by conversation.
 *
 * Kept apart from the conversation entries because it is not conversation
 * metadata: nothing fetches it, nothing persists it, and it is as valid before
 * a conversation has loaded as after. The realtime layer feeds it through
 * {@link note}; the inbox row and the chat's nav bar read it back.
 */
export class TypingTracker {
	#typing = new SvelteMap<string, SvelteSet<number>>();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- expiry bookkeeping, nothing renders from it
	#timers = new Map<string, ReturnType<typeof setTimeout>>();

	/** Apply one `chat.v1.typing_status` event. */
	note({
		conversationId,
		profileId,
		status,
	}: {
		conversationId: string;
		profileId: number;
		status: TypingStatus;
	}): void {
		if (status !== "Typing") {
			this.clear({ conversationId, profileId });
			return;
		}

		const typists = this.#typing.get(conversationId) ?? new SvelteSet();
		typists.add(profileId);
		this.#typing.set(conversationId, typists);

		const id = key(conversationId, profileId);
		clearTimeout(this.#timers.get(id));
		this.#timers.set(
			id,
			setTimeout(
				() => this.clear({ conversationId, profileId }),
				TYPING_EXPIRY_MS,
			),
		);
	}

	/** Is anyone on the other side of this conversation typing right now? */
	isTyping(conversationId: string): boolean {
		return (this.#typing.get(conversationId)?.size ?? 0) > 0;
	}

	clear({
		conversationId,
		profileId,
	}: {
		conversationId: string;
		profileId: number;
	}): void {
		const id = key(conversationId, profileId);
		clearTimeout(this.#timers.get(id));
		this.#timers.delete(id);

		const typists = this.#typing.get(conversationId);
		if (!typists) return;
		typists.delete(profileId);
		if (typists.size === 0) this.#typing.delete(conversationId);
	}

	/** Drop a whole conversation, e.g. when it is deleted under us. */
	forget(conversationId: string): void {
		const typists = this.#typing.get(conversationId);
		if (!typists) return;
		for (const profileId of [...typists]) {
			this.clear({ conversationId, profileId });
		}
	}

	destroy(): void {
		for (const timer of this.#timers.values()) clearTimeout(timer);
		this.#timers.clear();
		this.#typing.clear();
	}
}
