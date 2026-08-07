import z from "zod";

import { fetchRest } from "$lib/api/transport";
import {
	type ApiResponseMessage,
	apiResponseMessageSchema,
} from "$lib/model/messaging/messages";
import { unixTimestampMsSchema } from "$lib/model/types";
import { ws } from "$lib/ws.svelte";
import type { Conversation } from "$lib/model/messaging/conversations";
import type { messageSchema } from "$lib/model/messaging/messages";

const conversationMessagesSchema = z.object({
	lastReadTimestamp: unixTimestampMsSchema.nullable(),
	messages: z.array(apiResponseMessageSchema),
	profile: z.object({
		distance: z.number().nullable(),
		mediaHash: z.string().nullable(),
		name: z.string().nullable(),
		onlineUntil: z.number().nullable(),
		profileId: z.int(),
		showDistance: z.boolean(),
	}),
});

const unauthorizedActionSchema = z.object({
	type: z.literal("urn:gr:err:unauthorized_action"),
});

export class ConversationUnavailableError extends Error {
	readonly conversationId: string;

	constructor(conversationId: string) {
		super(`Conversation ${conversationId} is no longer available`);
		this.name = "ConversationUnavailableError";
		this.conversationId = conversationId;
	}
}

function isUnauthorizedAction(body: string): boolean {
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		return false;
	}
	return unauthorizedActionSchema.safeParse(parsed).success;
}

export async function getConversationMessages({
	conversationId,
	pageKey,
}: {
	conversationId: string;
	pageKey?: string;
}) {
	const params = new URLSearchParams({ profile: "true" });
	if (pageKey !== undefined) params.set("pageKey", pageKey);
	const res = await fetchRest(
		`/v5/chat/conversation/${conversationId}/message?` + params.toString(),
		{ method: "GET" },
	);
	if (res.status === 403 && isUnauthorizedAction(res.text())) {
		throw new ConversationUnavailableError(conversationId);
	}
	res.assertOk();
	return res.jsonParsed(conversationMessagesSchema);
}

export async function getSingleMessage({
	conversationId,
	messageId,
}: {
	conversationId: string;
	messageId: string;
}) {
	const message = await fetchRest(
		`/v4/chat/conversation/${conversationId}/message/${messageId}`,
		{ method: "GET" },
	).then((res) =>
		res.jsonParsed(z.object({ message: apiResponseMessageSchema })),
	);
	return message;
}

function toOutboundBody(message: z.infer<typeof messageSchema>): unknown {
	if (message.type === "Image" || message.type === "ExpiringImage") {
		return { mediaId: message.body.mediaId };
	}
	return message.body;
}

export async function sendMessage({
	toUserId,
	message,
	replyToMessageId,
}: {
	toUserId: number;
	message: z.infer<typeof messageSchema>;
	replyToMessageId?: string;
}) {
	const body = {
		type: message.type,
			target: { type: "Direct", targetId: toUserId },
		body: toOutboundBody(message),
		...(replyToMessageId !== undefined ? { replyToMessageId } : {}),
	};
	// The HTTP endpoint 400s when `replyToMessageId` is set — it's only
	// accepted by the websocket command variant of this same request.
	if (replyToMessageId !== undefined) {
		return await ws.sendCommand(
			"chat.v1.message.send",
			body,
			apiResponseMessageSchema,
		);
	}
	return await fetchRest("/v4/chat/message/send", {
		method: "POST",
		body,
	}).then((res) => res.jsonParsed(apiResponseMessageSchema));
}

/**
 * Sends one of the album-content message types — the album viewer's reply bar
 * and its 🔥 button. Both land in the chat with the album's owner.
 *
 * Only the ids (and the text, for a reply) go out: the preview URL, owner and
 * expiry documented on the *received* body are filled in server-side, so this
 * deliberately doesn't route through {@link sendMessage}, which would forward a
 * whole parsed body back.
 */
async function sendAlbumContentMessage({
	toUserId,
	type,
	body,
}: {
	toUserId: number;
	type: "AlbumContentReply" | "AlbumContentReaction";
	body: Record<string, unknown>;
}) {
	return await fetchRest("/v4/chat/message/send", {
		method: "POST",
		body: {
			type,
			target: { type: "Direct", targetId: toUserId },
			body,
		},
	}).then((res) => res.jsonParsed(apiResponseMessageSchema));
}

/** Replies to a single photo or video inside an album. */
export async function sendAlbumContentReply({
	toUserId,
	albumId,
	albumContentId,
	reply,
}: {
	toUserId: number;
	albumId: number;
	albumContentId: number;
	reply: string;
}) {
	return await sendAlbumContentMessage({
		toUserId,
		type: "AlbumContentReply",
		body: { albumId, albumContentId, albumContentReply: reply },
	});
}

/**
 * Reacts to a single photo or video inside an album. The API offers no choice
 * of emoji — a reaction always means 🔥.
 */
export async function sendAlbumContentReaction({
	toUserId,
	albumId,
	albumContentId,
}: {
	toUserId: number;
	albumId: number;
	albumContentId: number;
}) {
	return await sendAlbumContentMessage({
		toUserId,
		type: "AlbumContentReaction",
		body: { albumId, albumContentId },
	});
}

export async function reactToMessage({
	conversationId,
	messageId,
	reactionType,
}: {
	conversationId: Conversation["data"]["conversationId"];
	messageId: ApiResponseMessage["messageId"];
	reactionType: number;
}) {
	return await fetchRest("/v4/chat/message/reaction", {
		method: "POST",
		body: { conversationId, messageId, reactionType },
	});
}

export async function deleteMessageForMe({
	conversationId,
	messageId,
}: {
	conversationId: Conversation["data"]["conversationId"];
	messageId: ApiResponseMessage["messageId"];
}) {
	return await fetchRest(`/v4/chat/message/delete`, {
		method: "POST",
		body: { conversationId, messageId },
	}).then((res) => res.assertOk());
}

export async function unsendMessage({
	conversationId,
	messageId,
}: {
	conversationId: Conversation["data"]["conversationId"];
	messageId: ApiResponseMessage["messageId"];
}) {
	return await fetchRest(`/v4/chat/message/unsend`, {
		method: "POST",
		body: { conversationId, messageId },
	}).then((res) => res.assertOk());
}
