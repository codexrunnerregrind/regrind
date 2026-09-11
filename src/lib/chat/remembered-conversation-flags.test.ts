import { describe, expect, it } from "vitest";

import type { Conversation } from "$lib/model/messaging/conversations";
import { conversation } from "./conversations-test-helpers";
import { RememberedConversationFlags } from "./remembered-conversation-flags";

function gated(conversationId: string): Conversation {
	const entry = conversation(conversationId, 1);
	return { ...entry, type: "partial_conversation_v1" } as Conversation;
}

describe("RememberedConversationFlags", () => {
	it("leaves a gated entry alone when nothing was ever known about it", () => {
		const remembered = new RememberedConversationFlags();
		const entry = gated("a");

		remembered.applyTo([entry]);

		expect(entry.data.pinned).toBe(false);
	});

	it("puts back the flags the full entry had shown", () => {
		const remembered = new RememberedConversationFlags();
		remembered.applyTo([
			conversation("a", 1, { pinned: true, muted: true, favorite: true }),
		]);

		const entry = gated("a");
		remembered.applyTo([entry]);

		expect(entry.data.pinned).toBe(true);
		expect(entry.data.muted).toBe(true);
		expect(entry.data.favorite).toBe(true);
	});

	it("seeds one entry once, so the list can still unpin it", () => {
		const remembered = new RememberedConversationFlags();
		remembered.applyTo([conversation("a", 1, { pinned: true })]);
		const entry = gated("a");
		remembered.applyTo([entry]);

		entry.data.pinned = false;
		remembered.applyTo([entry]);

		expect(entry.data.pinned).toBe(false);
	});

	it("takes the server's flags back once the entry is no longer gated", () => {
		const remembered = new RememberedConversationFlags();
		remembered.applyTo([conversation("a", 1, { pinned: true })]);

		const full = conversation("a", 2, { pinned: false });
		remembered.applyTo([full]);

		expect(full.data.pinned).toBe(false);
	});

	it("keeps each conversation's flags to itself", () => {
		const remembered = new RememberedConversationFlags();
		remembered.applyTo([conversation("a", 1, { pinned: true })]);

		const other = gated("b");
		remembered.applyTo([other]);

		expect(other.data.pinned).toBe(false);
	});
});
