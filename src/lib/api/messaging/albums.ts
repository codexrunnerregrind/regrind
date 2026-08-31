import { invoke } from "@tauri-apps/api/core";
import z from "zod";

import { fetchRest } from "$lib/api/transport";
import { demoEnabled, demoUploadAlbumContent } from "$lib/demo";
import {
	albumContentSchema,
	albumDetailsSchema,
	type AlbumExpirationType,
	albumMinSchema,
	type AlbumShareRequest,
	albumSharesSchema,
	myAlbumsResponseSchema,
	pressieAlbumsFeedResponseSchema,
	pressieAlbumsPaywallResponseSchema,
	sharedAlbumSchema,
} from "$lib/model/messaging/albums";
import { toBase64 } from "$lib/util/base64";

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
 * album cap.
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
	return await fetchRest(`/v1/albums/${albumId}`, { method: "DELETE" }).then(
		(res) => res.assertOk(),
	);
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

const albumContentUploadSchema = z.object({
	contentId: z.int(),
	contentUrl: z.string().nullable(),
});

/**
 * Adds one photo to an album.
 *
 * This is the only upload in the API that takes `multipart/form-data`, which
 * the REST bridge has no way to send, so it goes through its own Tauri command
 * with the bytes rather than through {@link fetchRest}. The API answers a
 * re-upload of the same bytes with the first upload's content id instead of a
 * second copy.
 */
export async function uploadAlbumContent({
	albumId,
	bytes,
	contentType,
}: {
	albumId: number;
	bytes: Uint8Array<ArrayBuffer>;
	contentType: string;
}) {
	if (demoEnabled) {
		return demoUploadAlbumContent({ albumId, bytes, contentType });
	}
	const response = await invoke("upload_album_content", {
		albumId,
		contentType,
		data: toBase64(bytes),
	});
	return albumContentUploadSchema.parse(response);
}

/** The profiles an album is currently shared with. */
export async function getAlbumShares(albumId: number) {
	const { profileIds } = await fetchRest(`/v1/albums/${albumId}/shares`).then(
		(res) => res.jsonParsed(albumSharesSchema),
	);
	return profileIds ?? [];
}

/**
 * Revokes an album share.
 *
 * `shareId` and `expiresAt` are optional per the spec, but the official client
 * appears to send them, so they go along with the documented placeholder
 * `shareId` of `"0"` rather than being omitted. `GET .../shares` returns only
 * profile ids, so there is no per-share id to echo back.
 */
export async function unshareAlbum({
	albumId,
	profileIds,
}: {
	albumId: number;
	profileIds: number[];
}) {
	return await fetchRest(`/v1/albums/${albumId}/unshares`, {
		method: "PUT",
		body: {
			profiles: profileIds.map((profileId) => ({
				profileId,
				shareId: "0",
				expiresAt: null,
			})),
		},
	}).then((res) => res.assertOk());
}

/**
 * Drops our own access to an album someone shared with us — the recipient's side
 * of a share, the counterpart to the owner's {@link unshareAlbum}.
 *
 * A share that is already gone answers 403 rather than 404, so that status is
 * treated as success: the album is not there either way, and reporting a failure
 * over one would leave a tile nothing can remove.
 */
export async function removeAlbumShare({ albumId }: { albumId: number }) {
	const res = await fetchRest(`/v1/albums/${albumId}/shares/remove`, {
		method: "PUT",
	});
	if (res.status !== 403) res.assertOk();
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
	expirationType = "INDEFINITE",
}: {
	albumId: number;
	profileIds: number[];
	expirationType?: AlbumExpirationType;
}) {
	return await fetchRest(`/v4/albums/${albumId}/shares`, {
		method: "POST",
		body: {
			profiles: profileIds.map((profileId) => ({
				profileId,
				expirationType,
			})),
		} satisfies AlbumShareRequest,
	}).then((res) => res.assertOk());
}

/**
 * The "albums shared with me" feed powering the inbox Albums tab. Distinct from
 * {@link getAlbumsSharedByProfile}, which lists a single profile's shares.
 */
export async function getSharedAlbumsFeed() {
	return await fetchRest("/v3/pressie-albums/feed", {
		method: "POST",
		body: {},
	}).then((res) => res.jsonParsed(pressieAlbumsFeedResponseSchema));
}

/**
 * The upsell teaser for albums we cannot open. `GET /v2/albums/{albumId}`
 * answers a locked or expired share with no content at all, but this endpoint
 * still hands out media for those same albums so the official app can show what
 * is behind its paywall — so it is the fallback when opening one fails.
 *
 * What it returns is only the blurred, downscaled `.cover` variant: the
 * full-resolution originals sit behind a per-file CDN signature that just the
 * entitled album-content endpoint issues, so this is as sharp as it gets
 * without access to the album itself.
 *
 * `counterpartyId` narrows the response to one profile's albums; `null` asks
 * for everything the account is being upsold on.
 */
export async function getAlbumsPaywallContent(
	counterpartyId: number | null = null,
) {
	const { albumPaywallContent } = await fetchRest(
		"/v3/pressie-albums/feed/paywall/",
		{ method: "POST", body: { counterpartyId } },
	).then((res) => res.jsonParsed(pressieAlbumsPaywallResponseSchema));
	return albumPaywallContent ?? [];
}
