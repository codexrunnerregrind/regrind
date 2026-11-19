import z from "zod";

import { mediaUrlSchema } from "#lib/model/media.ts";
import { rightNowPostMediaDataSchema } from "#lib/model/right-now/feed.ts";
import { rightNowShareLocationSchema } from "#lib/model/right-now/index.ts";
import {
	arrayOfParsableEntries,
	knownValueOrNull,
	serverDefault,
} from "#lib/model/tolerance.ts";
import { unixTimestampMsSchema } from "#lib/model/types.ts";

/** The longest text the API accepts on a post. */
export const RIGHT_NOW_TEXT_LIMIT = 140;

/**
 * A photo on a post, referenced by the id its upload returned. `album_v1` points
 * at one of our own albums instead of a single image.
 */
export const rightNowPostMediaSchema = z.object({
	type: z.enum(["image_v1", "album_v1"]),
	data: z.object({ id: z.int().nonnegative() }),
});

export type RightNowPostMedia = z.infer<typeof rightNowPostMediaSchema>;

export const rightNowCreatePostSchema = z.object({
	text: z.string().max(RIGHT_NOW_TEXT_LIMIT).nullable(),
	shareLocation: rightNowShareLocationSchema,
	lat: z.number().nullable(),
	lon: z.number().nullable(),
	/** Metres. How far from `lat`/`lon` the post is allowed to look like it is. */
	locationRadius: z.int().nonnegative().nullable(),
	media: z.array(rightNowPostMediaSchema),
	hosting: z.boolean(),
	/** Profile fields the post carries over; the app sends none of its own. */
	sharedFields: z.array(z.string()),
});

export type RightNowCreatePost = z.infer<typeof rightNowCreatePostSchema>;

/** Everything a patch may carry. Only the keys sent are changed. */
export const rightNowUpdatePostSchema = z.object({
	text: z.string().max(RIGHT_NOW_TEXT_LIMIT).nullable().optional(),
	/** Takes the post out of the feed without deleting it. */
	hidden: z.boolean().nullable().optional(),
	hosting: z.boolean().nullable().optional(),
	media: z.array(rightNowPostMediaSchema).nullable().optional(),
	shareLocation: rightNowShareLocationSchema.nullable().optional(),
	locationRadius: z.int().nonnegative().nullable().optional(),
});

export type RightNowUpdatePost = z.infer<typeof rightNowUpdatePostSchema>;

/**
 * Our own post as the API hands it back. Loose: this is only ever read to show
 * what is already posted, and an unfamiliar field is not a reason to fail.
 */
export const rightNowOwnPostSchema = z.looseObject({
	id: z.int().nonnegative(),
	profileId: z.coerce.number().int().nonnegative(),
	activeText: z.string().nullish(),
	hosting: z.boolean().nullish(),
	posted: z.number().nullish(),
	expiration: z.number().nullish(),
	postStatus: z.string().nullish(),
	shareLocation: rightNowShareLocationSchema.nullish().catch(null),
	locationRadius: z.number().nullish(),
	media: z.array(z.unknown()).nullish(),
});

export type RightNowOwnPost = z.infer<typeof rightNowOwnPostSchema>;

export const rightNowMediaUploadSchema = z.object({
	mediaId: z.int().nonnegative(),
	url: z.string(),
	thumbnailUrl: z.string(),
});

export type RightNowMediaUpload = z.infer<typeof rightNowMediaUploadSchema>;

const rightNowPostStatusSchema = z.enum([
	"AWAITING_PAYMENT",
	"AWAITING_MODERATION",
	"ACTIVE",
	"EXPIRED",
	"HIDDEN",
]);
export type RightNowPostStatus = z.infer<typeof rightNowPostStatusSchema>;

const moderatedTextSchema = z.object({
	id: z.int(),
	postId: z.int(),
	text: z.string(),
	textStatus: knownValueOrNull({
		value: z.enum(["AWAITING_MODERATION", "MODERATION_FAILED", "ERROR"]),
		label: "right now post text status",
	}),
	rejectReasons: serverDefault({ value: z.array(z.string()), fallback: [] }),
	createdAt: unixTimestampMsSchema,
	updatedAt: unixTimestampMsSchema,
	deleted: serverDefault({ value: z.boolean(), fallback: false }),
});
export type RightNowModeratedText = z.infer<typeof moderatedTextSchema>;

const postDetailsMediaSchema = rightNowPostMediaDataSchema.extend({
	state: knownValueOrNull({
		value: z.enum(["PENDING", "APPROVED", "REJECTED", "DELETED"]),
		label: "right now post media state",
	}),
	reason: z.string().nullable().default(null),
});
export type RightNowPostDetailsMedia = z.infer<typeof postDetailsMediaSchema>;

export const rightNowPostDetailsSchema = z.object({
	id: z.int(),
	profileId: z.int().nonnegative(),
	posted: unixTimestampMsSchema.nullable(),
	expiration: unixTimestampMsSchema.nullable(),
	hosting: z.boolean(),
	activeText: z.string().nullable(),
	moderatedText: moderatedTextSchema.nullable(),
	media: serverDefault({
		value: arrayOfParsableEntries({
			entries: postDetailsMediaSchema,
			label: "right now post details media",
		}),
		fallback: [],
	}),
	lat: z.number().nullable(),
	lon: z.number().nullable(),
	postStatus: knownValueOrNull({
		value: rightNowPostStatusSchema,
		label: "right now post status",
	}),
	shareLocation: knownValueOrNull({
		value: rightNowShareLocationSchema,
		label: "right now post share location",
	}),
	locationRadius: z.int().nullable(),
});
export type RightNowPostDetails = z.infer<typeof rightNowPostDetailsSchema>;

export const rightNowPostResponseSchema = z.object({
	post: rightNowPostDetailsSchema.nullable(),
});
export type RightNowPostResponse = z.infer<typeof rightNowPostResponseSchema>;

const rightNowPostMediaReferenceSchema = z.object({
	type: z.literal("image_v1"),
	data: z.object({ id: z.int() }),
});

export const rightNowLocationRadiusRange = { min: 0, max: 100 } as const;

export const rightNowPostRequestSchema = z.object({
	text: z.string().optional(),
	shareLocation: rightNowShareLocationSchema,
	locationRadius: z
		.int()
		.min(rightNowLocationRadiusRange.min)
		.max(rightNowLocationRadiusRange.max)
		.optional(),
	media: z.array(rightNowPostMediaReferenceSchema),
	hosting: z.boolean(),
});
export type RightNowPostRequest = z.infer<typeof rightNowPostRequestSchema>;

export const rightNowPostChangesSchema = rightNowPostRequestSchema.partial();
export type RightNowPostChanges = z.infer<typeof rightNowPostChangesSchema>;

export const rightNowMediaUploadResponseSchema = z.object({
	mediaId: z.int(),
	url: mediaUrlSchema,
	thumbnailUrl: mediaUrlSchema,
});
export type RightNowMediaUploadResponse = z.infer<
	typeof rightNowMediaUploadResponseSchema
>;
