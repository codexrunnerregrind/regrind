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
