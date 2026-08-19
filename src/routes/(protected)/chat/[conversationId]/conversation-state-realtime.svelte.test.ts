import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getConversationMock,
	markReadMock,
	messageDeletedHandlers,
	refreshDynamicHandlers,
} = vi.hoisted(() => ({
	getConversationMock: vi.fn(),
	markReadMock: vi.fn(),
	messageDeletedHandlers: [] as ((event: unknown) => void)[],
	refreshDynamicHandlers: [] as ((event: unknown) => void)[],
}));

vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferences: () => Promise.resolve({ revealMessageRead: true }),
}));
vi.mock("$lib/api/messaging/conversations", () => ({
	markConversationAsRead: vi.fn(() => Promise.resolve()),
}));
vi.mock("$lib/api/messaging/messages", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/messaging/messages")>()),
	reactToMessage: vi.fn(),
	sendMessage: vi.fn(),
}));
vi.mock("$lib/util/reconcile", () => ({
	reconciler: { subscribe: () => vi.fn() },
}));
vi.mock("./messages", () => ({ getConversation: getConversationMock }));
vi.mock("$lib/ws.svelte", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/ws.svelte")>()),
	ws: {
		on(eventType: string, _schema: unknown, handler: (e: unknown) => void) {
			if (eventType === "chat.v1.message_deleted")
				messageDeletedHandlers.push(handler);
			if (eventType === "chat.v1.refresh_dynamic")
				refreshDynamicHandlers.push(handler);
			return Promise.resolve(vi.fn());
		},
	},
}));

import { Drafts } from "$lib/chat/drafts.svelte";
import { TypingTracker } from "$lib/chat/typing.svelte";
import { ConversationState } from "./conversation-state.svelte";

const CONVERSATION_ID = "1:2";
const OUR_ID = 1;
const PEER_ID = 2;

const message = (messageId: string, timestamp: number) => ({
	messageId,
	conversationId: CONVERSATION_ID,
	senderId: OUR_ID,
	timestamp,
	unsent: false,
	reactions: [],
	type: "Text" as const,
	body: { text: messageId },
});

const profile = {
	distance: null,
	mediaHash: null,
	name: "Peer",
	onlineUntil: null,
	profileId: PEER_ID,
	showDistance: false,
};

const flush = () => new Promise((r) => setTimeout(r, 0));

function conversationsStub() {
	return {
		setActive: vi.fn(),
		clearActive: vi.fn(),
		getCachedConversation: vi.fn(() => undefined),
		setCachedConversation: vi.fn(),
		updatePreview: vi.fn(),
		markRead: markReadMock,
		ensureLoaded: vi.fn(),
		remove: vi.fn(() => ({ revert: vi.fn() })),
		drafts: new Drafts(),
		typing: new TypingTracker(),
	};
}

function create(conversations = conversationsStub()) {
	return new ConversationState({
		conversationId: CONVERSATION_ID,
		ourProfileId: OUR_ID,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		conversations: conversations as any,
	});
}

describe("ConversationState deletes and album refreshes", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		messageDeletedHandlers.length = 0;
		refreshDynamicHandlers.length = 0;
	});

	async function loaded() {
		getConversationMock.mockResolvedValue({
			messages: [message("m2", 2000), message("m1", 1000)],
			profile,
			pageKey: null,
			lastReadTimestamp: null,
		});
		const state = create();
		await flush();
		getConversationMock.mockClear();
		return state;
	}

	// A hard delete, unlike an unsend, leaves no tombstone to render.
	it("takes a deleted message off the list", async () => {
		const state = await loaded();
		messageDeletedHandlers[0]?.({
			payload: { conversationId: CONVERSATION_ID, messageId: "m1" },
		});
		await flush();

		expect(state.messages.map((m) => m.messageId)).toEqual(["m2"]);
		expect(getConversationMock).not.toHaveBeenCalled();
	});

	it("leaves another conversation's delete alone", async () => {
		const state = await loaded();
		messageDeletedHandlers[0]?.({
			payload: { conversationId: "9:9", messageId: "m1" },
		});
		await flush();

		expect(state.messages).toHaveLength(2);
		expect(getConversationMock).not.toHaveBeenCalled();
	});

	// The payload is undocumented: one that names nothing we hold still means a
	// message we show may be gone, so the list has to be refetched.
	it("refetches when the delete names nothing it can match", async () => {
		await loaded();
		messageDeletedHandlers[0]?.({ payload: { somethingElse: 7 } });
		await flush();

		expect(getConversationMock).toHaveBeenCalled();
	});

	it("refetches when an album in the conversation changes", async () => {
		await loaded();
		refreshDynamicHandlers[0]?.({
			payload: {
				conversationId: CONVERSATION_ID,
				messageType: "ExpiringAlbum",
			},
		});
		await flush();

		expect(getConversationMock).toHaveBeenCalled();
	});

	it("ignores an album change in another conversation", async () => {
		await loaded();
		refreshDynamicHandlers[0]?.({
			payload: { conversationId: "9:9", messageType: "Album" },
		});
		await flush();

		expect(getConversationMock).not.toHaveBeenCalled();
	});

	it("reports the peer's typing from the tracker", async () => {
		const conversations = conversationsStub();
		getConversationMock.mockResolvedValue({
			messages: [],
			profile,
			pageKey: null,
			lastReadTimestamp: null,
		});
		const state = create(conversations);
		await flush();

		expect(state.typing).toBe(false);
		conversations.typing.note({
			conversationId: CONVERSATION_ID,
			profileId: PEER_ID,
			status: "Typing",
		});
		expect(state.typing).toBe(true);
	});
});
