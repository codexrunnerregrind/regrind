// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Drafts } from "$lib/chat/drafts.svelte";
import { TypingTracker } from "$lib/chat/typing.svelte";

const { conversations, currentPage } = vi.hoisted(() => ({
	conversations: {
		drafts: null as Drafts | null,
		typing: null as TypingTracker | null,
	},
	currentPage: { params: {} },
}));

vi.mock("$app/state", () => ({ page: currentPage }));
vi.mock("$lib/chat/conversations-context.svelte", () => ({
	getConversations: () => conversations,
}));

import type { Conversation as ConversationType } from "$lib/model/messaging/conversations";
import Conversation from "./Conversation.svelte";

const DESCRIPTION = '[data-slot="item-description"]';
const DRAFT_PREFIX = '[data-slot="conversation-draft-prefix"]';
const CONVERSATION_ID = "a:1";

let drafts: Drafts;
let typing: TypingTracker;

function conversation(
	preview: ConversationType["data"]["preview"],
	unreadCount = 0,
): ConversationType {
	return {
		type: "full_conversation_v1",
		data: {
			conversationId: CONVERSATION_ID,
			name: "Someone",
			participants: [
				{
					profileId: 2,
					primaryMediaHash: null,
					lastOnline: null,
					onlineUntil: null,
					distanceMetres: null,
					position: null,
					isInAList: false,
					hasDatingPotential: false,
				},
			],
			lastActivityTimestamp: 1_000_000,
			unreadCount,
			preview,
			muted: false,
			pinned: false,
			favorite: false,
			rightNow: "NOT_ACTIVE",
			onlineUntil: null,
			hasUnreadThrob: false,
			locked: false,
		},
	};
}

function textPreview(text: string): ConversationType["data"]["preview"] {
	return {
		type: "Text",
		text,
		albumId: null,
		imageHash: null,
		lat: null,
		lon: null,
		duration: null,
		photoContentReply: null,
	};
}

function renderRow(
	preview: ConversationType["data"]["preview"],
	unreadCount = 0,
) {
	return render(Conversation, {
		props: {
			conversation: conversation(preview, unreadCount),
			onEnterSelection: () => {},
		},
	});
}

function descriptionClass(container: HTMLElement): string {
	return container.querySelector(DESCRIPTION)?.className ?? "";
}

function previewLine(container: HTMLElement): string {
	const text = container.querySelector(DESCRIPTION)?.textContent ?? "";
	return text.replaceAll("\u00a0", " ").trim();
}

describe("Conversation preview line", () => {
	beforeEach(() => {
		drafts = new Drafts();
		conversations.drafts = drafts;
		typing = new TypingTracker();
		conversations.typing = typing;
	});

	afterEach(cleanup);

	it("shows the last message when there is no draft", () => {
		const { container } = renderRow(textPreview("hello there"));

		expect(previewLine(container)).toBe("hello there");
	});

	it("replaces the preview with the draft, one space after the prefix", () => {
		drafts.save({ conversationId: CONVERSATION_ID, text: "see you at" });
		const { container } = renderRow(textPreview("hello there"));

		expect(previewLine(container)).toBe("Draft: see you at");
	});

	it("joins the prefix to the draft with a non-breaking space", () => {
		drafts.save({ conversationId: CONVERSATION_ID, text: "see you at" });
		const { container } = renderRow(textPreview("hello there"));

		expect(container.querySelector(DESCRIPTION)?.textContent).toBe(
			"Draft:\u00a0see you at",
		);
	});

	it("carries the prefix as its own element inside the preview line", () => {
		drafts.save({ conversationId: CONVERSATION_ID, text: "see you at" });
		const { container } = renderRow(textPreview("hello there"));

		expect(
			container
				.querySelector(`${DESCRIPTION} ${DRAFT_PREFIX}`)
				?.textContent?.trim(),
		).toBe("Draft:");
	});

	it("shows the draft even when no preview can be rendered", () => {
		drafts.save({ conversationId: CONVERSATION_ID, text: "see you at" });
		const { container } = renderRow(null);

		expect(previewLine(container)).toBe("Draft: see you at");
	});

	it("falls back to the unavailable notice with neither draft nor preview", () => {
		const { container } = renderRow(null);

		expect(previewLine(container)).toBe("Preview not available");
	});

	it("follows the draft as it is saved and cleared", async () => {
		const { container } = renderRow(textPreview("hello there"));

		drafts.save({ conversationId: CONVERSATION_ID, text: "typing" });
		await tick();
		expect(previewLine(container)).toBe("Draft: typing");

		drafts.save({ conversationId: CONVERSATION_ID, text: "" });
		await tick();
		expect(previewLine(container)).toBe("hello there");
	});

	it("emphasizes an unread message but never the user's own draft", () => {
		const { container: unread } = renderRow(
			textPreview("can't make it"),
			1,
		);

		expect(descriptionClass(unread)).toContain("font-semibold");
		cleanup();

		drafts.save({ conversationId: CONVERSATION_ID, text: "see you at" });
		const { container: drafted } = renderRow(
			textPreview("can't make it"),
			1,
		);

		expect(descriptionClass(drafted)).not.toContain("font-semibold");
	});

	it("ignores a draft belonging to another conversation", () => {
		drafts.save({ conversationId: "b:2", text: "not mine" });
		const { container } = renderRow(textPreview("hello there"));

		expect(previewLine(container)).toBe("hello there");
	});
});

describe("Conversation typing line", () => {
	beforeEach(() => {
		drafts = new Drafts();
		conversations.drafts = drafts;
		typing = new TypingTracker();
		conversations.typing = typing;
	});

	afterEach(cleanup);

	// Typing is live and lasts seconds; a draft and a preview both keep saying
	// what they say, so the transient one takes the line while it stands.
	it("takes the line from both the draft and the preview", async () => {
		drafts.save({
			conversationId: CONVERSATION_ID,
			text: "half a thought",
		});
		const { container } = renderRow(textPreview("hello there"));
		expect(previewLine(container)).toBe("Draft: half a thought");

		typing.note({
			conversationId: CONVERSATION_ID,
			profileId: 2,
			status: "Typing",
		});
		await tick();
		expect(previewLine(container)).toBe("Typing…");
		expect(container.querySelector(DRAFT_PREFIX)).toBeNull();

		typing.note({
			conversationId: CONVERSATION_ID,
			profileId: 2,
			status: "Sent",
		});
		await tick();
		expect(previewLine(container)).toBe("Draft: half a thought");
	});

	it("ignores another conversation's typing", async () => {
		const { container } = renderRow(textPreview("hello there"));
		typing.note({ conversationId: "b:2", profileId: 2, status: "Typing" });
		await tick();

		expect(previewLine(container)).toBe("hello there");
	});
});
