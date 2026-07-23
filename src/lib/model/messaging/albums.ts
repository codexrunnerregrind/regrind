import z from "zod";

import { unixTimestampMsSchema } from "$lib/model/types";

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

export const albumExpirationTypeSchema = z.enum(Object.keys(AlbumExpiration));

export type AlbumExpirationType = z.infer<typeof albumExpirationTypeSchema>;

export const albumExpirationSchema = z.object({
	expiresAt: unixTimestampMsSchema.nullable(),
	expirationType: albumExpirationTypeSchema.optional().nullable(),
});

export const albumContentMin = z.object({
	contentId: z.int(),
	contentType: z.string(),
	coverUrl: z.url().nullable(),
	statusId: z.int(),
});

export const albumContentSchema = albumContentMin.extend({
	thumbUrl: z.url(),
	url: z.url().or(z.literal("")),
	processing: z.boolean().nullable(),
	rejectionId: z.unknown().nullable(),
});

// One of the albums returned by GET /v1/albums (the albums we own).
export const myAlbumSchema = z.object({
	...albumDetailsSchema.shape,
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

// Body for POST /v4/albums/{albumId}/shares.
export const albumShareProfileSchema = z.object({
	profileId: z.int(),
	expirationType: albumExpirationTypeSchema.optional(),
});

export type AlbumShareProfile = z.infer<typeof albumShareProfileSchema>;

export const albumShareRequestSchema = z.object({
	profiles: z.array(albumShareProfileSchema),
});

// Body for PUT /v1/albums/{albumId}/unshares. shareId may be 0.
export const albumUnshareProfileSchema = z.object({
	profileId: z.int(),
	shareId: z.int(),
});

export type AlbumUnshareProfile = z.infer<typeof albumUnshareProfileSchema>;

export const albumUnshareRequestSchema = z.object({
	profiles: z.array(albumUnshareProfileSchema),
});

// A trimmed-down profile attached to albums shared with us.
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
export const sharedAlbumSchema = z.object({
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
			coverContent: z.string().nullable().optional(),
			status: z.string().optional(),
		})
		.nullable()
		.optional(),
	profile: pressieProfileMiniSchema.nullable().optional(),
});

export type SharedAlbum = z.infer<typeof sharedAlbumSchema>;

export const pressieAlbumsFeedResponseSchema = z.object({
	sharedAlbums: z.array(sharedAlbumSchema),
	nonEmptyPersonalAlbumCount: z.number().optional(),
});
