import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getConversationsMock,
	currentPage,
	singleColumn,
	conversationDeleteHandlers,
	conversationUpdateHandlers,
	cacheBombHandlers,
	refreshDynamicHandlers,
	messageDeletedHandlers,
	messageSentHandlers,
	typingHandlers,
} = vi.hoisted(() => ({
	getConversationsMock: vi.fn(),
	currentPage: { route: { id: "/(protected)/chat" } },
	singleColumn: { current: false },
	conversationDeleteHandlers: [] as ((event: unknown) => void)[],
	conversationUpdateHandlers: [] as ((event: unknown) => void)[],
	cacheBombHandlers: [] as ((event: unknown) => void)[],
	refreshDynamicHandlers: [] as ((event: unknown) => void)[],
	messageDeletedHandlers: [] as ((event: unknown) => void)[],
	messageSentHandlers: [] as ((event: unknown) => void)[],
	typingHandlers: [] as ((event: unknown) => void)[],
}));

vi.mock("$app/state", () => ({ page: currentPage }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/api/messaging/conversations", () => ({
	getConversations: getConversationsMock,
	markConversationAsRead: vi.fn(() => Promise.resolve()),
	deleteConversationForMe: vi.fn(() => Promise.resolve()),
	setConversationPinned: vi.fn(() => Promise.resolve()),
	setConversationMuted: vi.fn(() => Promise.resolve()),
}));
vi.mock("$lib/util/breakpoints.svelte", () => ({ below: () => singleColumn }));
vi.mock("$lib/util/reconcile", () => ({
	reconciler: { subscribe: () => vi.fn() },
}));
vi.mock("$lib/ws.svelte", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/ws.svelte")>()),
	ws: {
		on(eventType: string, _schema: unknown, handler: (e: unknown) => void) {
			const handlers: Record<string, ((e: unknown) => void)[]> = {
				"chat.v1.message_sent": messageSentHandlers,
				"chat.v1.conversation.delete": conversationDeleteHandlers,
				"chat.v1.conversation.update": conversationUpdateHandlers,
				"chat.v1.cache_bomb.inbox": cacheBombHandlers,
				"chat.v1.refresh_dynamic": refreshDynamicHandlers,
				"chat.v1.message_deleted": messageDeletedHandlers,
				"chat.v1.typing_status": typingHandlers,
			};
			handlers[eventType]?.push(handler);
			return Promise.resolve(vi.fn());
		},
	},
}));

import { ConversationsState } from "./conversations-state.svelte";
import {
	conversation,
	incomingMessage,
	microtasks,
	OUR_ID,
	PEER_ID,
	settled,
} from "./conversations-test-helpers";

function emitMessageSent(payload: unknown) {
	messageSentHandlers[0]?.({ payload });
}

beforeEach(() => {
	vi.clearAllMocks();
	for (const handlers of [
		conversationDeleteHandlers,
		conversationUpdateHandlers,
		cacheBombHandlers,
		refreshDynamicHandlers,
		messageDeletedHandlers,
		messageSentHandlers,
		typingHandlers,
	]) {
		handlers.length = 0;
	}
});

describe("ConversationsState realtime inbox signals", () => {
	async function loaded() {
		getConversationsMock.mockResolvedValue({
			entries: [conversation("a:1", 1000)],
			nextPage: null,
		});
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage: vi.fn(),
		});
		await settled(state);
		getConversationsMock.mockClear();
		return state;
	}

	it("refetches the inbox when the server bombs its cache", async () => {
		vi.useFakeTimers();
		try {
			const state = await loaded();
			cacheBombHandlers[0]?.({ payload: {} });

			expect(getConversationsMock).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(500);
			expect(getConversationsMock).toHaveBeenCalled();
			await settled(state);
		} finally {
			vi.useRealTimers();
		}
	});

	// A delete and a cache bomb routinely land together, and an update arrives
	// once per conversation; all of them ask for the same single refetch.
	it("folds a burst of signals into one refetch", async () => {
		vi.useFakeTimers();
		try {
			const state = await loaded();
			cacheBombHandlers[0]?.({ payload: {} });
			conversationUpdateHandlers[0]?.({
				payload: { conversationIds: ["a:1"] },
			});
			messageDeletedHandlers[0]?.({
				payload: { conversationId: "a:1", messageId: "m1" },
			});

			await vi.advanceTimersByTimeAsync(500);
			expect(getConversationsMock).toHaveBeenCalledTimes(1);
			await settled(state);
		} finally {
			vi.useRealTimers();
		}
	});

	// The stored messages are a snapshot from when they were sent, so an album
	// reshared or expired since has to come off the cache.
	it("drops a conversation's cached messages when its albums change", async () => {
		const state = await loaded();
		state.setCachedConversation({
			conversationId: "a:1",
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			data: { messages: [] } as any,
		});
		refreshDynamicHandlers[0]?.({
			payload: { conversationId: "a:1", messageType: "Album" },
		});

		expect(state.getCachedConversation("a:1")).toBeUndefined();
	});

	it("tracks a peer typing, and stops when their message lands", async () => {
		const state = await loaded();
		typingHandlers[0]?.({
			payload: {
				conversationId: "a:1",
				profileId: PEER_ID,
				status: "Typing",
			},
		});
		expect(state.typing.isTyping("a:1")).toBe(true);

		emitMessageSent(
			incomingMessage("a:1", { timestamp: 2000, senderId: PEER_ID }),
		);
		await microtasks();

		expect(state.typing.isTyping("a:1")).toBe(false);
	});

	// Our own typing, echoed back from another device, is not something to show
	// ourselves in our own inbox.
	it("ignores our own typing", async () => {
		const state = await loaded();
		typingHandlers[0]?.({
			payload: {
				conversationId: "a:1",
				profileId: OUR_ID,
				status: "Typing",
			},
		});

		expect(state.typing.isTyping("a:1")).toBe(false);
	});

	it("forgets typing for a conversation the server deletes", async () => {
		const state = await loaded();
		typingHandlers[0]?.({
			payload: {
				conversationId: "a:1",
				profileId: PEER_ID,
				status: "Typing",
			},
		});
		conversationDeleteHandlers[0]?.({
			payload: { conversationIds: ["a:1"] },
		});

		expect(state.typing.isTyping("a:1")).toBe(false);
	});
});
