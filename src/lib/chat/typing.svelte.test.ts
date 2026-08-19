import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TYPING_EXPIRY_MS, TypingTracker } from "./typing.svelte";

const CONVERSATION = "a:1";
const PEER = 2;
const OTHER_PEER = 3;

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("TypingTracker", () => {
	it("tracks a peer's typing per conversation", () => {
		const typing = new TypingTracker();
		typing.note({
			conversationId: CONVERSATION,
			profileId: PEER,
			status: "Typing",
		});

		expect(typing.isTyping(CONVERSATION)).toBe(true);
		expect(typing.isTyping("b:2")).toBe(false);
	});

	it.each(["Cleared", "Sent"] as const)("drops it on %s", (status) => {
		const typing = new TypingTracker();
		typing.note({
			conversationId: CONVERSATION,
			profileId: PEER,
			status: "Typing",
		});
		typing.note({ conversationId: CONVERSATION, profileId: PEER, status });

		expect(typing.isTyping(CONVERSATION)).toBe(false);
	});

	// A peer who force-quits mid-word sends no `Cleared`, and neither does a
	// socket that dies under one.
	it("expires a notice nothing follows", () => {
		const typing = new TypingTracker();
		typing.note({
			conversationId: CONVERSATION,
			profileId: PEER,
			status: "Typing",
		});

		vi.advanceTimersByTime(TYPING_EXPIRY_MS - 1);
		expect(typing.isTyping(CONVERSATION)).toBe(true);

		vi.advanceTimersByTime(1);
		expect(typing.isTyping(CONVERSATION)).toBe(false);
	});

	it("renews the expiry while the peer keeps typing", () => {
		const typing = new TypingTracker();
		typing.note({
			conversationId: CONVERSATION,
			profileId: PEER,
			status: "Typing",
		});
		vi.advanceTimersByTime(TYPING_EXPIRY_MS - 1);
		typing.note({
			conversationId: CONVERSATION,
			profileId: PEER,
			status: "Typing",
		});
		vi.advanceTimersByTime(TYPING_EXPIRY_MS - 1);

		expect(typing.isTyping(CONVERSATION)).toBe(true);
	});

	// One peer stopping says nothing about the other, and the group
	// conversations the API models would otherwise flicker.
	it("keeps the indicator up while another participant types", () => {
		const typing = new TypingTracker();
		for (const profileId of [PEER, OTHER_PEER]) {
			typing.note({
				conversationId: CONVERSATION,
				profileId,
				status: "Typing",
			});
		}
		typing.note({
			conversationId: CONVERSATION,
			profileId: PEER,
			status: "Cleared",
		});

		expect(typing.isTyping(CONVERSATION)).toBe(true);

		typing.note({
			conversationId: CONVERSATION,
			profileId: OTHER_PEER,
			status: "Cleared",
		});
		expect(typing.isTyping(CONVERSATION)).toBe(false);
	});

	// A cleared conversation whose timer still stood would clear a *later*
	// notice for the same peer the moment the old timer fired.
	it("does not let a stale timer clear a fresh notice", () => {
		const typing = new TypingTracker();
		typing.note({
			conversationId: CONVERSATION,
			profileId: PEER,
			status: "Typing",
		});
		typing.clear({ conversationId: CONVERSATION, profileId: PEER });
		vi.advanceTimersByTime(TYPING_EXPIRY_MS - 1);
		typing.note({
			conversationId: CONVERSATION,
			profileId: PEER,
			status: "Typing",
		});
		vi.advanceTimersByTime(1);

		expect(typing.isTyping(CONVERSATION)).toBe(true);
	});

	it("forgets a whole conversation, timers included", () => {
		const typing = new TypingTracker();
		typing.note({
			conversationId: CONVERSATION,
			profileId: PEER,
			status: "Typing",
		});
		typing.forget(CONVERSATION);

		expect(typing.isTyping(CONVERSATION)).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("leaves no timer behind when destroyed", () => {
		const typing = new TypingTracker();
		typing.note({
			conversationId: CONVERSATION,
			profileId: PEER,
			status: "Typing",
		});
		typing.destroy();

		expect(typing.isTyping(CONVERSATION)).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});
});
