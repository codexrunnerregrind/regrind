import { describe, expect, it } from "vitest";

import {
	previewFromMessage,
	previewLabel,
	quoteLabel,
} from "$lib/model/messaging/message-preview";

describe("previewFromMessage", () => {
	it("extracts preview text from text messages", () => {
		expect(
			previewFromMessage({
				type: "Text",
				body: { text: "hello" },
				messageId: "msg-1",
				conversationId: "conversation-1",
				senderId: 42,
				timestamp: 1_710_000_000_000,
				unsent: false,
				reactions: [],
				dynamic: false,
			}),
		).toEqual({
			type: "Text",
			text: "hello",
			albumId: null,
			imageHash: null,
		});
	});

	it("extracts album previews without inventing text", () => {
		expect(
			previewFromMessage({
				type: "Album",
				body: {
					albumId: 7,
					hasUnseenContent: false,
					expiresAt: null,
					coverUrl: "https://example.com/cover.jpg",
					ownerProfileId: 42,
					isViewable: true,
					hasVideo: false,
					hasPhoto: true,
					expirationType: null,
				},
				messageId: "msg-2",
				conversationId: "conversation-1",
				senderId: 42,
				timestamp: 1_710_000_000_000,
				unsent: false,
				reactions: [],
				dynamic: false,
			}),
		).toEqual({ type: "Album", text: null, albumId: 7, imageHash: null });
	});

	it.each(["ExpiringAlbum", "ExpiringAlbumV2"] as const)(
		"keeps the albumId for %s so the preview reads as an album",
		(type) => {
			const preview = previewFromMessage({
				type,
				body: {
					albumId: 9,
					hasUnseenContent: false,
					expiresAt: 1_710_000_000_000,
					coverUrl: "https://example.com/cover.jpg",
					ownerProfileId: 42,
					isViewable: true,
					hasVideo: false,
					hasPhoto: true,
					expirationType: "ONCE",
					viewableUntil: 1_710_000_000_000,
				},
				messageId: "msg-3",
				conversationId: "conversation-1",
				senderId: 42,
				timestamp: 1_710_000_000_000,
				unsent: false,
				reactions: [],
				dynamic: false,
			});
			expect(preview).toEqual({
				type,
				text: null,
				albumId: 9,
				imageHash: null,
			});
			expect(previewLabel(preview)).toBe("Album");
		},
	);

	it("labels expiring images apart from regular photos", () => {
		const preview = previewFromMessage({
			type: "ExpiringImage",
			body: {
				mediaId: 11,
				width: null,
				height: null,
				url: null,
				viewsRemaining: 1,
			},
			messageId: "msg-4",
			conversationId: "conversation-1",
			senderId: 42,
			timestamp: 1_710_000_000_000,
			unsent: false,
			reactions: [],
			dynamic: false,
		});

		expect(preview).toEqual({
			type: "ExpiringImage",
			text: null,
			albumId: null,
			imageHash: null,
		});
		expect(previewLabel(preview)).toBe("Expiring image");
	});

	it("labels a chat video the way its bubble does", () => {
		const preview = previewFromMessage({
			type: "Video",
			body: {
				mediaId: 12,
				url: "https://cdns.grindr.com/videos/chat/clip.mp4",
				contentType: "video/mp4",
				length: 8000,
				maxViews: 2,
				viewsRemaining: 2,
				looping: false,
			},
			messageId: "msg-5",
			conversationId: "conversation-1",
			senderId: 42,
			timestamp: 1_710_000_000_000,
			unsent: false,
			reactions: [],
			dynamic: false,
		});

		expect(previewLabel(preview)).toBe("Expiring video");
		expect(previewLabel({ type: "PrivateVideo" })).toBe("Expiring video");
	});
});

describe("quoteLabel", () => {
	const preview = (type: string, text: string | null = null) => ({
		type,
		text,
		albumId: null,
		imageHash: null,
	});

	it("uses the message text when there is any", () => {
		expect(quoteLabel(preview("Text", "hello"))).toBe("hello");
	});

	// The inbox and the quote pill read the same table, so a type named in one is
	// named the same way in the other.
	it.each([
		["Unsent", "Unsent message"],
		["Audio", "Voice message"],
		["ExpiringImage", "Expiring image"],
		["Giphy", "GIF"],
		["Gaymoji", "Gaymoji"],
		["Location", "Location"],
		["VideoCall", "Video call"],
		["NonExpiringVideo", "Video"],
		["ProfilePhotoReply", "Photo"],
		["RightNowRequest", "Right Now"],
	])("names a %s in the inbox and in a quote alike", (type, expected) => {
		expect(previewLabel(preview(type))).toBe(expected);
		expect(quoteLabel(preview(type))).toBe(expected);
	});

	// A call status message has no text of its own, so the preview carries the
	// outcome the bubble shows rather than the bare type name.
	it("previews a call by its outcome", () => {
		expect(
			previewLabel(
				previewFromMessage({
					type: "VideoCall",
					body: { result: "SUCCESSFUL", videoCallDuration: 83 },
					messageId: "msg-call",
					conversationId: "conversation-1",
					senderId: 42,
					timestamp: 1_710_000_000_000,
					unsent: false,
					reactions: [],
					dynamic: false,
				}),
			),
		).toBe("Video call · 1:23");
	});

	it.each(["Unknown", "Generative", "SomethingNewFromTheApi"])(
		"falls back to a plain name for %s",
		(type) => {
			expect(previewLabel(preview(type))).toBe("Message");
			expect(quoteLabel(preview(type))).toBe("Message");
		},
	);

	// A conversation with no last message at all is the one case with nothing to
	// name: the inbox row shows no preview line rather than the word "Message".
	it("names nothing when there is no message", () => {
		expect(previewLabel(null)).toBeNull();
		expect(previewLabel(preview(""))).toBeNull();
	});

	it("does not render an empty pill for a blank text message", () => {
		expect(quoteLabel(preview("Text", "   "))).toBe("Message");
	});
});
