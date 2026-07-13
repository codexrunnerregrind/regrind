import z from "zod";

// 1. PostData Schema
export const PostDataSchema = z.object({
  '@type': z.string(),
  id: z.number().int(),
  profileId: z.number().int(),
  mediaHash: z.string().optional(),
  displayName: z.string().optional(),
  media: z.array(z.lazy(() => RightNowPostMediaItemSchema)),
  text: z.string().optional(),
  distance: z.number().int().optional(),
  hosting: z.boolean(),
  posted: z.number().int(), // unix timestamp in milliseconds
  expiration: z.number().int(), // unix timestamp in milliseconds
  onlineUntil: z.number().int().optional(), // unix timestamp in milliseconds
  mpuScore: z.number().optional(),
  recentlyChatted: z.boolean(),
  favorite: z.boolean(),
});

// 2. RightNowPostMediaItem Schema
export const RightNowPostMediaItemSchema = z.object({
  type: z.string(),
  data: z.object({
    mediaId: z.number().int(),
    thumbnailUrl: z.string().url(),
    fullImageUrl: z.string().url(),
    contentType: z.string(),
    state: z.string(),
    reason: z.string().nullable().optional(),
    isRejectAutomated: z.boolean().nullable().optional(),
    shouldBlur: z.boolean(),
    isNsfw: z.boolean(),
    source: z.string(),
  }),
});

// 3. Leaf post variations mapped inside the discriminator union
export const CuratedPostSchema = z.object({
  type: z.literal('curated_post_v1'),
  data: z.object({
    '@type': z.string(),
    type: z.string(),
  }),
});

export const UpsellInsertSchema = z.object({
  type: z.literal("upsell_insert_v1"),
  data: z.object({
    "@type": z.string(),
    type: z.string(),
  }),
});

export const RightNowPostSchema = z.object({
  type: z.literal('right_now_post_v3'),
  data: PostDataSchema,
});

export const LockedPostSchema = z.object({
  type: z.literal('locked_post_v1'),
  data: PostDataSchema,
});

export const RightNowFeedResponseItemSchema = z.discriminatedUnion('type', [
  CuratedPostSchema,
  RightNowPostSchema,
  LockedPostSchema,
  UpsellInsertSchema,
]);

// 5. Root Entry Schema
export const RightNowFeedResponseSchema = z.object({
  items: z.array(RightNowFeedResponseItemSchema),
  viewerCount: z.number().int(),
});

// TypeScript Inference Types
export type PostData = z.infer<typeof PostDataSchema>;
export type RightNowPostMediaItem = z.infer<typeof RightNowPostMediaItemSchema>;
export type RightNowFeedResponseItem = z.infer<typeof RightNowFeedResponseItemSchema>;
export type RightNowFeedResponse = z.infer<typeof RightNowFeedResponseSchema>;