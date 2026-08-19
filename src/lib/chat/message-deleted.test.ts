import { describe, expect, it } from "vitest";

import { deletedConversationIds, deletedMessageIds } from "./message-deleted";

type Payload = Parameters<typeof deletedConversationIds>[0];

const payload = (fields: Record<string, unknown>) => fields as Payload;

describe("chat.v1.message_deleted payload readers", () => {
	it("reads the singular ids", () => {
		const event = payload({ conversationId: "a:1", messageId: "m1" });

		expect(deletedConversationIds(event)).toEqual(["a:1"]);
		expect(deletedMessageIds(event)).toEqual(["m1"]);
	});

	it("reads the plural ids", () => {
		const event = payload({
			conversationIds: ["a:1", "b:2"],
			messageIds: ["m1", "m2"],
		});

		expect(deletedConversationIds(event)).toEqual(["a:1", "b:2"]);
		expect(deletedMessageIds(event)).toEqual(["m1", "m2"]);
	});

	// The payload is undocumented, so a shape we do not recognise has to read as
	// "we cannot tell", never as "nothing was deleted".
	it("reads a shape it does not recognise as empty", () => {
		const event = payload({ somethingElse: 7 });

		expect(deletedConversationIds(event)).toEqual([]);
		expect(deletedMessageIds(event)).toEqual([]);
	});

	it("ignores nulls rather than carrying them through", () => {
		const event = payload({ conversationId: null, messageId: null });

		expect(deletedConversationIds(event)).toEqual([]);
		expect(deletedMessageIds(event)).toEqual([]);
	});
});
