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
	// Deliberately lenient rather than `albumExpirationTypeSchema`: a
	// conversation page parses its messages as a plain array, so an expiration
	// type we don't know about yet would fail the whole page instead of one
	// message. Nothing reads this value back out.
	expirationType: z.string().optional().nullable(),
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

/**
 * An album another profile has shared with us. Unlike {@link myAlbumSchema},
 * `content` is a single blurred preview item rather than the whole album.
 */
export const sharedAlbumSchema = z.object({
	...albumMinSchema.shape,
	...albumExpirationSchema.shape,
	content: albumContentMin.nullish(),
	contentCount: z
		.object({
			imageCount: z.int(),
			videoCount: z.int(),
		})
		.nullish(),
});

export type SharedAlbum = z.infer<typeof sharedAlbumSchema>;

export const albumStorageLimitsSchema = z.object({
	subscriptionType: z.string(),
	maxAlbums: z.int(),
	maxContentItemsPerAlbum: z.int(),
	maxShares: z.int(),
	maxViewableAlbums: z.int(),
	maxViewableVideos: z.int(),
	maxContentSizeInBytes: z.int(),
	maxContentSizeHumanReadable: z.string(),
	maxVideoLength: z.int(),
	minVideoLength: z.int(),
	maxShareableAlbums: z.int(),
	maxVideosPerAlbum: z.int(),
});

export type AlbumStorageLimits = z.infer<typeof albumStorageLimitsSchema>;
