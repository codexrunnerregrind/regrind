import z from "zod";

import { mediaUrlSchema } from "$lib/model/media";
import { knownValueOrNull } from "$lib/model/tolerance";
import { unixTimestampMsSchema, unmodeledSchema } from "$lib/model/types";

/**
 * Album names are capped at 255 *UTF-8 bytes*, not characters — one emoji can
 * cost four of them.
 */
export const ALBUM_NAME_MAX_BYTES = 255;

export function albumNameByteLength(albumName: string): number {
	return new TextEncoder().encode(albumName).length;
}

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

/**
 * The expiration types we know how to send. `Object.keys` widens to `string[]`,
 * so the assertion is what keeps this a union of the literal names rather than
 * plain `string`.
 */
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
	processing: z.boolean().nullable(),
	rejectionId: unmodeledSchema,
});

export const myAlbumSchema = albumDetailsSchema.extend({
	albumId: z.int(),
	albumName: z.string().nullable(),
	profileId: z.int(),
	version: z.int(),
	content: z.array(albumContentSchema),
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
 * What the account is allowed to keep in an album. The API answers a full album
 * with a bare `400 unknown error`, so the cap is read before an upload rather
 * than guessed at from the refusal.
 *
 * `nullish` — the spec marks it required, and a field the API drops is one
 * limit not to enforce rather than a broken response. The body carries the clip
 * limits too; nothing reads them while adding a clip is off.
 */
export const albumStorageLimitsSchema = z.object({
	maxContentItemsPerAlbum: z.int().nullish(),
});

export type AlbumStorageLimits = z.infer<typeof albumStorageLimitsSchema>;

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
