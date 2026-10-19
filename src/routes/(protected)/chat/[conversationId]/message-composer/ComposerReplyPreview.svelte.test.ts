// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Drafts } from "$lib/chat/drafts.svelte";
import type { ApiResponseMessage } from "$lib/model/messaging/messages";
import ComposerReplyPreview from "./ComposerReplyPreview.svelte";

const { conversations } = vi.hoisted(() => ({
	conversations: { drafts: null as Drafts | null },
}));

vi.mock("$app/navigation", () => ({ onNavigate: vi.fn() }));
vi.mock("$lib/chat/conversations-context.svelte", () => ({
	getConversations: () => conversations,
}));
vi.mock("./send-media/send-media-offer.svelte", () => ({
	getSendMediaOffer: () => ({ lend: () => {}, offer: async () => {} }),
}));
vi.mock("../conversation-state.svelte", () => ({
	getConversationState: () => () => ({}),
}));
vi.mock("./composer-sheets-state.svelte", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("./composer-sheets-state.svelte")>();
	return {
		...actual,
		getComposerSheets: () => new actual.ComposerSheetsState(),
	};
});

vi.mock("../conversation-state.svelte", () => ({
	getConversationState: () => () => ({
		ourProfileId: 1,
		profile: { name: "Sam" },
	}),
}));

// the module builds a WsState on import, which reaches for a Tauri host that a
// jsdom run has no business providing
vi.mock("$lib/ws.svelte", () => ({
	ws: {
		status: "connected",
		connect: () => {},
		on: () => Promise.resolve(() => {}),
		onConnected: () => Promise.resolve(() => {}),
		onEventsDropped: () => Promise.resolve(() => {}),
		onEventRejected: () => () => {},
		send: () => {},
		sendCommand: () => Promise.resolve(undefined),
	},
}));

vi.stubGlobal(
	"ResizeObserver",
	class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
);

const message = {
	type: "Text",
	body: { text: "the quoted text" },
	messageId: "msg-quoted",
	conversationId: "a:1",
	senderId: 7,
	timestamp: 1_710_000_000_000,
} as unknown as ApiResponseMessage;

function classesOf(element: Element): string[] {
	return (element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

function renderPreview() {
	const onCancel = vi.fn();
	const { container } = render(ComposerReplyPreview, {
		props: { message, onCancel },
	});
	return {
		onCancel,
		pill: container.firstElementChild!,
		close: screen.getByRole("button", { name: "Cancel reply" }),
	};
}

describe("ComposerReplyPreview", () => {
	beforeEach(() => {
		conversations.drafts = new Drafts();
	});

	afterEach(cleanup);

	it("names the message being replied to", () => {
		renderPreview();

		expect(screen.getByText("the quoted text")).toBeTruthy();
	});

	it("cancels the reply when the close control is clicked", async () => {
		const { close, onCancel } = renderPreview();

		await fireEvent.click(close);

		expect(onCancel).toHaveBeenCalledOnce();
	});

	it("says whose message is being quoted", () => {
		renderPreview();

		expect(screen.getByText("Replying to Sam")).toBeTruthy();
	});

	it("gives the close control a full touch target of its own", () => {
		const { close } = renderPreview();

		expect(classesOf(close)).toEqual(
			expect.arrayContaining(["size-9", "rounded-full"]),
		);
	});
});
