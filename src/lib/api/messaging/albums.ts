import z from "zod";

import { fetchRest } from "$lib/api";
import {
	albumContentSchema,
	albumDetailsSchema,
	type AlbumExpirationType,
	albumMinSchema,
	albumStorageLimitsSchema,
	myAlbumSchema,
	sharedAlbumSchema,
} from "$lib/model/messaging/albums";

const albumResponseSchema = z.object({
	...albumMinSchema.shape,
	...albumDetailsSchema.shape,
	content: z.array(
		z.object({
			...albumContentSchema.shape,
			remainingViews: z.int().optional(),
		}),
	),
});

export async function getAlbumContent(albumId: number) {
	return await fetchRest(`/v2/albums/${albumId}`).then((res) =>
		res.jsonParsed(albumResponseSchema),
	);
}

export type AlbumContentResponse = Awaited<ReturnType<typeof getAlbumContent>>;

const albumNameResponseSchema = z.object({
	albumId: z.int(),
	albumName: z.string().nullable(),
});

/**
 * Creates an empty album. Throws with a 402 response once the account is at its
 * {@link getAlbumLimits} album cap.
 */
export async function createAlbum({ albumName }: { albumName: string | null }) {
	const res = await fetchRest("/v2/albums", {
		method: "POST",
		body: { albumName },
	});
	// Asserted before parsing so the documented 402 surfaces as an HTTP error
	// rather than a schema-validation failure against the error body.
	res.assertOk();
	return res.jsonParsed(albumNameResponseSchema);
}

export async function renameAlbum({
	albumId,
	albumName,
}: {
	albumId: number;
	albumName: string | null;
}) {
	const res = await fetchRest(`/v2/albums/${albumId}`, {
		method: "PUT",
		body: { albumName },
	});
	res.assertOk();
	return res.jsonParsed(albumNameResponseSchema);
}

/** Deleting an album that is already gone answers 403, not 404. */
export async function deleteAlbum({ albumId }: { albumId: number }) {
	return await fetchRest(`/v1/albums/${albumId}`, {
		method: "DELETE",
	}).then((res) => res.assertOk());
}

/**
 * Replaces the album's content order. Every existing content id must appear
 * exactly once, so callers pass the full list rather than a delta.
 */
export async function reorderAlbumContent({
	albumId,
	contentIds,
}: {
	albumId: number;
	contentIds: number[];
}) {
	return await fetchRest(`/v1/albums/${albumId}/content/order`, {
		method: "POST",
		body: { contentIds },
	}).then((res) => res.assertOk());
}

export async function deleteAlbumContent({
	albumId,
	contentId,
}: {
	albumId: number;
	contentId: number;
}) {
	return await fetchRest(`/v1/albums/${albumId}/content/${contentId}`, {
		method: "DELETE",
	}).then((res) => res.assertOk());
}

const sharedAlbumsResponseSchema = z.object({
	albums: z.array(sharedAlbumSchema),
});

/** Albums the given profile has shared with us. */
export async function getAlbumsSharedByProfile(profileId: number) {
	const { albums } = await fetchRest(`/v2/albums/shares/${profileId}`).then(
		(res) => res.jsonParsed(sharedAlbumsResponseSchema),
	);
	return albums;
}

export async function getAlbumLimits() {
	return await fetchRest("/v1/albums/storage").then((res) =>
		res.jsonParsed(albumStorageLimitsSchema),
	);
}

const myAlbumsResponseSchema = z.object({
	albums: z.array(myAlbumSchema),
});

export async function getMyAlbums() {
	const { albums } = await fetchRest("/v1/albums").then((res) =>
		res.jsonParsed(myAlbumsResponseSchema),
	);
	return albums;
}

/**
 * Shares an album with the given profiles. The API automatically sends the
 * shared album to the chat with every listed profile.
 */
export async function shareAlbum({
	albumId,
	profileIds,
	expirationType,
}: {
	albumId: number;
	profileIds: number[];
	expirationType: AlbumExpirationType;
}) {
	return await fetchRest(`/v4/albums/${albumId}/shares`, {
		method: "POST",
		body: {
			profiles: profileIds.map((profileId) => ({ profileId, expirationType })),
		},
	}).then((res) => res.assertOk());
}
