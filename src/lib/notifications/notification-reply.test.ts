import { describe, expect, it } from "vitest";

import { peerIdFromConversation } from "$lib/notifications/notification-reply";

describe("peerIdFromConversation", () => {
	it("returns the id that is not ours", () => {
		expect(peerIdFromConversation("12:34", 12)).toBe(34);
		expect(peerIdFromConversation("12:34", 34)).toBe(12);
	});

	it("rejects malformed ids", () => {
		expect(peerIdFromConversation("abc", 1)).toBeNull();
		expect(peerIdFromConversation("1:x", 1)).toBeNull();
	});
});
