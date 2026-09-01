import z from "zod";

import { mediaHashPublicSchema } from "$lib/model/media";
import { rightNowStatusSchema } from "$lib/model/right-now";
import {
	arrayOfKnownVariants,
	knownValueOr,
	knownValueOrNull,
	serverDefault,
} from "$lib/model/tolerance";
import { unixTimestampMsSchema, unmodeledSchema } from "$lib/model/types";
import { sexualPositionSchema } from "$lib/model/users/profiles";

// Everything the server sends for a conversation whether or not the account can
// act on it — enough to draw a row, and nothing that acting on one would need.
const conversationDataSchema = z.object({
	conversationId: z.string(),
	name: z.string(),
	participants: z.array(
		z.object({
			profileId: z.number(),
			primaryMediaHash: mediaHashPublicSchema.nullish(),
			lastOnline: unixTimestampMsSchema.nullish(),
			onlineUntil: unixTimestampMsSchema.nullish(),
			distanceMetres: z.number().nullish(),
			position: knownValueOrNull({
				value: sexualPositionSchema,
				label: "conversation position",
			}),
			isInAList: serverDefault({ value: z.boolean(), fallback: false }),
			hasDatingPotential: serverDefault({
				value: z.boolean(),
				fallback: false,
			}),
		}),
	),
	lastActivityTimestamp: unixTimestampMsSchema,
	unreadCount: z.number(),
	preview: z
		.object({
			type: z.string(),
			text: z.string().nullish(),
			albumId: z.number().nullish(),
			imageHash: mediaHashPublicSchema.nullish(),
			lat: unmodeledSchema,
			lon: unmodeledSchema,
			duration: unmodeledSchema,
			photoContentReply: unmodeledSchema,
		})
		.nullish(),
});

export const fullConversationSchema = z.object({
	type: z.literal("full_conversation_v1"),
	data: conversationDataSchema.extend({
		muted: serverDefault({ value: z.boolean(), fallback: false }),
		pinned: serverDefault({ value: z.boolean(), fallback: false }),
		favorite: serverDefault({ value: z.boolean(), fallback: false }),
		rightNow: knownValueOr({
			value: rightNowStatusSchema,
			fallback: "NOT_ACTIVE",
			label: "conversation rightNow",
		}),
		onlineUntil: z.number().nullish(),
		hasUnreadThrob: serverDefault({ value: z.boolean(), fallback: false }),
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

export const conversationEntrySchema = z.discriminatedUnion("type", [
	fullConversationSchema,
	partialConversationSchema,
]);

function withLockedState(entry: z.infer<typeof conversationEntrySchema>) {
	return entry.type === "full_conversation_v1"
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
			};
}

export const conversationSchema =
	conversationEntrySchema.transform(withLockedState);

// Entry types the server may add are dropped rather than failing the page.
export const conversationEntriesSchema = arrayOfKnownVariants({
	variants: conversationEntrySchema,
	label: "inbox",
}).transform((entries) => entries.map(withLockedState));

export type Conversation = z.infer<typeof conversationSchema>;
