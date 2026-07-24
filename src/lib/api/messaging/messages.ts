import z from "zod";

import { fetchRest } from "$lib/api";
import {
	type ApiResponseMessage,
	apiResponseMessageSchema,
	messageSchema,
} from "$lib/model/messaging/messages";
import { unixTimestampMsSchema } from "$lib/model/types";
import { ws } from "$lib/ws.svelte";
import type { Conversation } from "$lib/model/messaging/conversations";

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

export async function getConversationMessages({
	conversationId,
	pageKey,
}: {
	conversationId: string;
	pageKey?: string;
}) {
	const params = new URLSearchParams({ profile: "true" });
	if (pageKey !== undefined) params.set("pageKey", pageKey);
	const messages = await fetchRest(
		`/v5/chat/conversation/${conversationId}/message?` + params.toString(),
		{ method: "GET" },
	).then((res) => res.jsonParsed(conversationMessagesSchema));
	return messages;
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
		target: {
			type: "Direct",
			targetId: toUserId,
		},
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
		body: {
			conversationId,
			messageId,
			reactionType,
		},
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
		body: {
			conversationId,
			messageId,
		},
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
		body: {
			conversationId,
			messageId,
		},
	}).then((res) => res.assertOk());
}
