import z from "zod";

import { fetchRest } from "$lib/api";
import {
	albumContentSchema,
	albumDetailsSchema,
	albumMinSchema,
	type AlbumShareProfile,
	type AlbumUnshareProfile,
	myAlbumsResponseSchema,
	pressieAlbumsFeedResponseSchema,
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

// The albums we own, used to pick one to share into a chat.
export async function getMyAlbums() {
	return await fetchRest("/v1/albums").then((res) =>
		res.jsonParsed(myAlbumsResponseSchema),
	);
}

// The albums other profiles have shared with us ("shared with me" feed).
export async function getSharedAlbumsFeed() {
	return await fetchRest("/v3/pressie-albums/feed", {
		method: "POST",
		body: {},
	}).then((res) => res.jsonParsed(pressieAlbumsFeedResponseSchema));
}

// Shares an album with the given profiles. The backend automatically posts the
// shared album as a message into the chat with each listed profile.
export async function shareAlbum({
	albumId,
	profiles,
}: {
	albumId: number;
	profiles: AlbumShareProfile[];
}) {
	await fetchRest(`/v4/albums/${albumId}/shares`, {
		method: "POST",
		body: { profiles },
	});
}

// Revokes the given profiles' access to a previously shared album.
export async function unshareAlbum({
	albumId,
	profiles,
}: {
	albumId: number;
	profiles: AlbumUnshareProfile[];
}) {
	await fetchRest(`/v1/albums/${albumId}/unshares`, {
		method: "PUT",
		body: { profiles },
	});
}
