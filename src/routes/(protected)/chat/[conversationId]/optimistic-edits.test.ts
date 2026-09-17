import { describe, expect, it, vi } from "vitest";

import type { OptimisticMessage } from "./merge-messages";
import { recordMediaViewsInPlace } from "./optimistic-edits";

function videoMessage(viewsRemaining: number | null): OptimisticMessage {
	return {
		messageId: "m1",
		conversationId: "1:2",
		senderId: 2,
		timestamp: 1,
		type: "Video",
		body: { url: null, maxViews: 1, viewsRemaining },
		reactions: [],
		unsent: false,
		status: "sent",
	} as unknown as OptimisticMessage;
}

describe("recordMediaViewsInPlace", () => {
	it("writes the count back and caches it", () => {
		const messages = [videoMessage(1)];
		const sync = vi.fn();

		recordMediaViewsInPlace({
			messages,
			messageId: "m1",
			viewsRemaining: 0,
			sync,
		});

		expect(
			(messages[0]?.body as { viewsRemaining: number }).viewsRemaining,
		).toBe(0);
		expect(sync).toHaveBeenCalledOnce();
	});

	it("leaves an unchanged count alone rather than caching again", () => {
		const messages = [videoMessage(0)];
		const sync = vi.fn();

		recordMediaViewsInPlace({
			messages,
			messageId: "m1",
			viewsRemaining: 0,
			sync,
		});

		expect(sync).not.toHaveBeenCalled();
	});

	it("ignores a message that is not there", () => {
		const sync = vi.fn();

		recordMediaViewsInPlace({
			messages: [videoMessage(1)],
			messageId: "gone",
			viewsRemaining: 0,
			sync,
		});

		expect(sync).not.toHaveBeenCalled();
	});
});
