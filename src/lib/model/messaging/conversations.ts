import z from "zod";

import { mediaHashPublicSchema } from "$lib/model/media";
import { rightNowStatusSchema } from "$lib/model/right-now";
import { unixTimestampMsSchema, unmodeledSchema } from "$lib/model/types";
import { sexualPositionSchema } from "$lib/model/users/profiles";

// Everything the server sends for a conversation whether or not the account can
// act on it — enough to draw a row, and nothing that acting on one would need.
const conversationDataSchema = z.object({
	conversationId: z.string(),
	name: z.string(),
	participants: z
		.array(
			z.object({
				profileId: z.number(),
				primaryMediaHash: mediaHashPublicSchema.nullable(),
				lastOnline: unixTimestampMsSchema.nullable(),
				onlineUntil: unixTimestampMsSchema.nullable(),
				distanceMetres: z.number().nullable(),
				position: sexualPositionSchema.nullable(),
				isInAList: z.boolean(),
				hasDatingPotential: z.boolean(),
			}),
		)
		.length(1),
	lastActivityTimestamp: unixTimestampMsSchema,
	unreadCount: z.number(),
	preview: z
		.object({
			type: z.string(),
			text: z.string().nullable(),
			albumId: z.number().nullable(),
			imageHash: mediaHashPublicSchema.nullable(),
			lat: unmodeledSchema,
			lon: unmodeledSchema,
			duration: unmodeledSchema,
			photoContentReply: unmodeledSchema,
		})
		.nullable(),
});

export const fullConversationSchema = z.object({
	type: z.literal("full_conversation_v1"),
	data: conversationDataSchema.extend({
		muted: z.boolean(),
		pinned: z.boolean(),
		favorite: z.boolean(),
		rightNow: rightNowStatusSchema,
		onlineUntil: z.number().nullable(),
		hasUnreadThrob: z.boolean(),
	}),
});

/**
 * A conversation past the free tier's display cap. The server still names it and
 * previews it, but sends none of the state that pinning, muting or a status dot
 * would read — so those arrive here at their "off" values, with `locked` saying
 * the row is that way because the account cannot see more, not because the
 * conversation is.
 *
 * Filtering the inbox surfaces these readily: a filter looks past the cap, so a
 * page comes back mixing both kinds.
 */
export const partialConversationSchema = z.object({
	type: z.literal("partial_conversation_v1"),
	data: conversationDataSchema,
});

export const conversationSchema = z
	.union([fullConversationSchema, partialConversationSchema])
	.transform((entry) =>
		entry.type === "full_conversation_v1"
			? { ...entry, data: { ...entry.data, locked: false } }
			: {
					...entry,
					data: {
						...entry.data,
						muted: false,
						pinned: false,
						favorite: false,
						rightNow: "NOT_ACTIVE" as const,
						onlineUntil: null,
						hasUnreadThrob: false,
						locked: true,
					},
				},
	);

export type Conversation = z.infer<typeof conversationSchema>;
