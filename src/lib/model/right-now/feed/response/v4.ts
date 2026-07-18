import z from "zod";

export const PostDataSchema = z.object({
	"@type": z.string(),
	id: z.number().int(),
	profileId: z.number().int(),
	mediaHash: z.string().optional(),
	displayName: z.string().optional(),
	media: z.array(z.lazy(() => RightNowPostMediaItemSchema)),
	text: z.string().optional(),
	distance: z.number().int().optional(),
	hosting: z.boolean(),
	posted: z.number().int(),
	expiration: z.number().int(),
	onlineUntil: z.number().int().optional(),
	mpuScore: z.number().optional(),
	recentlyChatted: z.boolean(),
	favorite: z.boolean(),
});

export const RightNowPostMediaItemSchema = z.object({
	type: z.string(),
	data: z.object({
		mediaId: z.number().int(),
		thumbnailUrl: z.url(),
		fullImageUrl: z.url(),
		contentType: z.string(),
		state: z.string(),
		reason: z.string().nullable().optional(),
		isRejectAutomated: z.boolean().nullable().optional(),
		shouldBlur: z.boolean(),
		isNsfw: z.boolean(),
		source: z.string(),
	}),
});

export const CuratedPostV1Schema = z.object({
	type: z.literal("curated_post_v1"),
	data: z.object({
		"@type": z.string(),
		type: z.string(),
	}),
});

export const UpsellInsertV1Schema = z.object({
	type: z.literal("upsell_insert_v1"),
	data: z.object({
		"@type": z.string(),
		type: z.string(),
	}),
});

export const RightNowV3PostSchema = z.object({
	type: z.literal("right_now_post_v3"),
	data: PostDataSchema,
});

export const LockedPostV1Schema = z.object({
	type: z.literal("locked_post_v1"),
	data: PostDataSchema,
});

export const RightNowFeedResponseItemSchema = z.discriminatedUnion("type", [
	CuratedPostV1Schema,
	RightNowV3PostSchema,
	LockedPostV1Schema,
	UpsellInsertV1Schema,
]);

export const RightNowFeedResponseSchema = z.object({
	items: z.array(RightNowFeedResponseItemSchema),
	viewerCount: z.number().int(),
});

export type PostData = z.infer<typeof PostDataSchema>;
export type RightNowPostMediaItem = z.infer<typeof RightNowPostMediaItemSchema>;
export type RightNowFeedResponseItem = z.infer<
	typeof RightNowFeedResponseItemSchema
>;
export type RightNowFeedResponse = z.infer<typeof RightNowFeedResponseSchema>;
