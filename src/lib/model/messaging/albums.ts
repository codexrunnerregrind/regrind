import z from "zod";

import { mediaUrlSchema } from "$lib/model/media";
import { knownValueOrNull } from "$lib/model/tolerance";
import { unixTimestampMsSchema, unmodeledSchema } from "$lib/model/types";

export const albumPreviewSchema = z.object({
	albumId: z.int(),
	hasUnseenContent: z.boolean(),
});

export const albumMinSchema = albumPreviewSchema.extend({
	albumName: z.string().nullable(),
	profileId: z.int(),
	albumViewable: z.boolean(),
});

export const albumDetailsSchema = z.object({
	sharedCount: z.int(),
	createdAt: z.iso.datetime({ local: true }),
	updatedAt: z.iso.datetime({ local: true }),
});

export const AlbumExpiration = {
	INDEFINITE: 0,
	ONCE: 1,
	TEN_MINUTES: 2,
	ONE_HOUR: 3,
	ONE_DAY: 4,
} as const;

export const albumExpirationTypeSchema = z.enum(
	Object.keys(AlbumExpiration) as (keyof typeof AlbumExpiration)[],
);

export type AlbumExpirationType = z.infer<typeof albumExpirationTypeSchema>;

export const albumExpirationSchema = z.object({
	expiresAt: unixTimestampMsSchema.nullable(),
	expirationType: knownValueOrNull({
		value: albumExpirationTypeSchema,
		label: "album expirationType",
	}).optional(),
});

export const albumContentMin = z.object({
	contentId: z.int(),
	contentType: z.string(),
	coverUrl: mediaUrlSchema.nullable(),
	statusId: z.int(),
});

export const albumContentSchema = albumContentMin.extend({
	thumbUrl: mediaUrlSchema,
	url: mediaUrlSchema.or(z.literal("")),
	processing: z.boolean(),
	rejectionId: unmodeledSchema,
});

export type AlbumContent = z.infer<typeof albumContentSchema>;

export const albumContentWithHashSchema = albumContentSchema.extend({
	contentHash: z.string().optional(),
});

export const myAlbumSchema = albumDetailsSchema.extend({
	albumId: z.int(),
	albumName: z.string().nullable(),
	profileId: z.int(),
	version: z.int(),
	content: z.array(albumContentWithHashSchema),
	isShareable: z.boolean(),
});

export type MyAlbum = z.infer<typeof myAlbumSchema>;

export const myAlbumsResponseSchema = z.object({
	albums: z.array(myAlbumSchema),
});

export const albumShareRequestSchema = z.object({
	profiles: z.array(
		z.object({
			profileId: z.int(),
			expirationType: albumExpirationTypeSchema,
		}),
	),
});

export type AlbumShareRequest = z.infer<typeof albumShareRequestSchema>;

export const albumSharesResponseSchema = z.object({
	profileIds: z.array(z.int()),
});

export const albumUnshareRequestProfileItemSchema = z.object({
	profileId: z.int(),
	shareId: z.string(),
});

export const albumUnshareRequestSchema = z.object({
	profiles: z.array(albumUnshareRequestProfileItemSchema),
});

export type AlbumUnshareRequest = z.infer<typeof albumUnshareRequestSchema>;

export const albumNameRequestSchema = z.object({
	albumName: z.string().max(255).nullable(),
});

export type AlbumNameRequest = z.infer<typeof albumNameRequestSchema>;

export const albumNameResponseSchema = z.object({
	albumId: z.int(),
	albumName: z.string().nullable(),
});

export const albumContentOrderRequestSchema = z.object({
	contentIds: z.array(z.int()),
});

export type AlbumContentOrderRequest = z.infer<
	typeof albumContentOrderRequestSchema
>;

export const albumStorageLimitsSchema = z.object({
	subscriptionType: z.string(),
	maxAlbums: z.int(),
	maxContentItemsPerAlbum: z.int(),
	maxShares: z.int(),
	maxViewableAlbums: z.int(),
	maxViewableVideos: z.int(),
	maxContentSize: z.int(),
	maxContentSizeHumanReadable: z.string(),
	maxVideoLength: z.int(),
	minVideoLength: z.int(),
	maxShareableAlbums: z.int(),
	maxVideosPerAlbum: z.int(),
});

export type AlbumStorageLimits = z.infer<typeof albumStorageLimitsSchema>;

export const albumContentUploadResponseSchema = z.object({
	contentId: z.int(),
	contentUrl: z.string().nullable(),
});

export const albumContentProcessingResponseSchema = z.object({
	processing: z.boolean(),
});

/**
 * Album names are capped at 255 *UTF-8 bytes*, not characters — one emoji can
 * cost four of them.
 */
export const ALBUM_NAME_MAX_BYTES = 255;

export function albumNameByteLength(albumName: string): number {
	return new TextEncoder().encode(albumName).length;
}

/**
 * An album another profile has shared with us. Unlike {@link myAlbumSchema},
 * `content` is a single blurred preview item rather than the whole album.
 */
export const sharedAlbumSchema = z.object({
	...albumMinSchema.shape,
	...albumExpirationSchema.shape,
	content: albumContentMin.nullish(),
	contentCount: z
		.object({ imageCount: z.int(), videoCount: z.int() })
		.nullish(),
});

export type SharedAlbum = z.infer<typeof sharedAlbumSchema>;

/**
 * The still frame the API makes for a clip. Its own endpoint because the
 * `thumbUrl` an album read carries for a clip is a URL that 404s until the
 * transcode has produced one.
 */
export const albumPosterSchema = z.object({
	posterUrl: mediaUrlSchema.nullish(),
	blurredPosterUrl: mediaUrlSchema.nullish(),
});

export const albumSharesSchema = z.object({
	// Tolerated as absent: the spec marks nothing on this body as required.
	profileIds: z.array(z.int()).nullish(),
});

// --- "Albums shared with me" feed (POST /v3/pressie-albums/feed) ---
// This is a separate contract from {@link sharedAlbumSchema} above (which is the
// per-profile shares list). The pressie feed powers the inbox Albums tab's
// "shared with me" grid, so its types are namespaced `Pressie*` to avoid
// colliding with the per-profile album types.

// --- "Albums shared with me" feed (POST /v3/pressie-albums/feed) ---
// This is a separate contract from {@link sharedAlbumSchema} above (which is the
// per-profile shares list). The pressie feed powers the inbox Albums tab's
// "shared with me" grid, so its types are namespaced `Pressie*` to avoid
// colliding with the per-profile album types.

export const pressieProfileMiniSchema = z.object({
	profileId: z.int(),
	name: z.string().nullable().optional(),
	profileUrl: z.string().nullable().optional(),
	onlineUntil: unixTimestampMsSchema.nullable().optional(),
	distanceKm: z.number().nullable().optional(),
});

export type PressieProfileMini = z.infer<typeof pressieProfileMiniSchema>;

// One album another profile has shared with us, as returned by the
// POST /v3/pressie-albums/feed "albums shared with me" endpoint. Kept lenient:
// the backend marks most fields optional/nullable once an album expires or is
// locked, and we only rely on the handful we render.
export const pressieSharedAlbumSchema = z.object({
	albumId: z.int(),
	hasUnseenContent: z.boolean().optional().default(false),
	albumViewable: z.boolean().optional().default(true),
	name: z.string().nullable().optional(),
	ownerProfileId: z.int().optional(),
	imageCount: z.int().optional(),
	videoCount: z.int().optional(),
	coverContent: z
		.object({
			id: z.int().optional(),
			contentType: z.string().optional(),
			// The signed CDN URL of the (blurred) cover preview. The backend calls
			// this field `location`; older payloads used `coverContent`.
			location: z.string().nullable().optional(),
			coverContent: z.string().nullable().optional(),
			status: z.string().optional(),
		})
		.nullable()
		.optional(),
	profile: pressieProfileMiniSchema.nullable().optional(),
});

export type PressieSharedAlbum = z.infer<typeof pressieSharedAlbumSchema>;

export const pressieAlbumsFeedResponseSchema = z.object({
	sharedAlbums: z.array(pressieSharedAlbumSchema),
	nonEmptyPersonalAlbumCount: z.number().optional(),
});

/**
 * The teaser the official app shows on its "unlock albums" upsell
 * (POST /v3/pressie-albums/feed/paywall/). It carries media URLs for albums we
 * are not entitled to open through `GET /v2/albums/{albumId}`, which is what
 * makes it the one way a locked or expired share still has anything to show.
 *
 * Lenient on purpose: nothing here is documented as required, and a paywall
 * entry missing its urls is a skipped album rather than a failed screen.
 */
export const pressieAlbumPaywallEntrySchema = z.object({
	albumId: z.int(),
	paywallCoverUrl: z.string().nullish(),
	paywallUrls: z.array(z.string()).nullish(),
	albumsItemCount: z.int().nullish(),
	profile: pressieProfileMiniSchema.nullable().optional(),
});

export type PressieAlbumPaywallEntry = z.infer<
	typeof pressieAlbumPaywallEntrySchema
>;

export const pressieAlbumsPaywallResponseSchema = z.object({
	albumPaywallContent: z.array(pressieAlbumPaywallEntrySchema).nullish(),
});
