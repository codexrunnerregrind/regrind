import z from "zod";

import { rightNowShareLocationSchema } from "$lib/model/right-now";

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
