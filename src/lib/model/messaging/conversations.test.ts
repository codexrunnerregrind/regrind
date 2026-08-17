import { describe, expect, it } from "vitest";

import { conversationSchema } from "./conversations";

const participant = {
	profileId: 100001,
	primaryMediaHash: null,
	lastOnline: 1_000_000,
	onlineUntil: 1_000_500,
	distanceMetres: 120,
	position: null,
	isInAList: false,
	hasDatingPotential: false,
};

const preview = {
	conversationId: { value: "100001:123456000" },
	type: "Text",
	text: "hey",
	albumId: null,
	imageHash: null,
	lat: null,
	lon: null,
	duration: null,
	photoContentReply: null,
};

const shared = {
	conversationId: "100001:123456000",
	name: "Someone",
	participants: [participant],
	lastActivityTimestamp: 1_000_000,
	unreadCount: 2,
	preview,
};

describe("conversationSchema", () => {
	it("reads a full conversation with its state intact", () => {
		const parsed = conversationSchema.parse({
			type: "full_conversation_v1",
			data: {
				...shared,
				muted: true,
				pinned: true,
				favorite: true,
				rightNow: "HOSTING",
				onlineUntil: 1_000_500,
				hasUnreadThrob: true,
			},
		});

		expect(parsed.data).toMatchObject({
			muted: true,
			pinned: true,
			favorite: true,
			rightNow: "HOSTING",
			locked: false,
		});
	});

	it("reads a partial conversation, defaulting the state it does not carry", () => {
		const parsed = conversationSchema.parse({
			type: "partial_conversation_v1",
			data: shared,
		});

		expect(parsed.data).toMatchObject({
			conversationId: "100001:123456000",
			name: "Someone",
			unreadCount: 2,
			muted: false,
			pinned: false,
			favorite: false,
			rightNow: "NOT_ACTIVE",
			onlineUntil: null,
			hasUnreadThrob: false,
			locked: true,
		});
	});

	it("still rejects an entry that is neither kind", () => {
		expect(() =>
			conversationSchema.parse({
				type: "something_else_v1",
				data: shared,
			}),
		).toThrow();
	});
});
