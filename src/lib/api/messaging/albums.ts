import { invoke } from "@tauri-apps/api/core";
import z from "zod";

import { cachedFetch } from "$lib/api/cache";
import { fetchRest, uploadFileRest } from "$lib/api/transport";
import {
	demoEnabled,
	demoUploadAlbumContent,
	demoUploadAlbumFile,
} from "$lib/demo";
import {
	type AlbumContentOrderRequest,
	albumContentProcessingResponseSchema,
	albumContentSchema,
	albumContentUploadResponseSchema,
	albumDetailsSchema,
	type AlbumExpirationType,
	albumMinSchema,
	type AlbumNameRequest,
	albumNameResponseSchema,
	albumPosterSchema,
	type AlbumShareRequest,
	albumSharesSchema,
	type AlbumStorageLimits,
	albumStorageLimitsSchema,
	type AlbumUnshareRequest,
	myAlbumsResponseSchema,
	pressieAlbumsFeedResponseSchema,
	pressieAlbumsPaywallResponseSchema,
	sharedAlbumSchema,
} from "$lib/model/messaging/albums";
import {
	mediaFileDescriptor,
	type MediaFileInspection,
} from "$lib/platform/media-file";
import { toBase64 } from "$lib/util/base64";
import type { PickedMedia } from "$lib/platform/media-picker";

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

export async function getMyAlbums() {
	const { albums } = await fetchRest("/v1/albums").then((res) =>
		res.jsonParsed(myAlbumsResponseSchema),
	);
	return albums;
}

export const getAlbumStorageLimits = cachedFetch(() =>
	fetchRest("/v1/albums/storage").then((res) =>
		res.jsonParsed(albumStorageLimitsSchema),
	),
);

export async function getAlbumContentProcessing({
	albumId,
	contentId,
}: {
	albumId: number;
	contentId: number;
}) {
	return await fetchRest(
		`/v1/albums/${albumId}/content/${contentId}/processing`,
	).then((res) => res.jsonParsed(albumContentProcessingResponseSchema));
}

export async function shareAlbum({
	albumId,
	profileIds,
	expirationType = "INDEFINITE",
}: {
	albumId: number;
	profileIds: number[];
	expirationType?: AlbumExpirationType;
}) {
	await fetchRest(`/v4/albums/${albumId}/shares`, {
		method: "POST",
		body: {
			profiles: profileIds.map((profileId) => ({
				profileId,
				expirationType,
			})),
		} satisfies AlbumShareRequest,
	}).then((res) => res.assertOk());
}

export async function getAlbumShares(albumId: number) {
	const { profileIds } = await fetchRest(`/v1/albums/${albumId}/shares`).then(
		(res) => res.jsonParsed(albumSharesSchema),
	);
	return profileIds ?? [];
}

export async function unshareAlbum({
	albumId,
	profileIds,
}: {
	albumId: number;
	profileIds: number[];
}) {
	await fetchRest(`/v1/albums/${albumId}/unshares`, {
		method: "PUT",
		body: {
			profiles: profileIds.map((profileId) => ({
				profileId,
				shareId: crypto.randomUUID(),
			})),
		} satisfies AlbumUnshareRequest,
	}).then((res) => res.assertOk());
}

export async function createAlbum({
	albumName = null,
}: { albumName?: string | null } = {}) {
	const res = await fetchRest("/v2/albums", {
		method: "POST",
		body: { albumName } satisfies AlbumNameRequest,
	});
	// Asserted before parsing so the documented 402 at the album cap surfaces as
	// an HTTP error the grid can name, rather than as a schema-validation
	// failure against the error body.
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
	return await fetchRest(`/v2/albums/${albumId}`, {
		method: "PUT",
		body: { albumName } satisfies AlbumNameRequest,
	}).then((res) => res.jsonParsed(albumNameResponseSchema));
}

export async function deleteAlbum({ albumId }: { albumId: number }) {
	await fetchRest(`/v1/albums/${albumId}`, { method: "DELETE" }).then((res) =>
		res.assertOk(),
	);
}

export async function deleteAlbumContent({
	albumId,
	contentId,
}: {
	albumId: number;
	contentId: number;
}) {
	await fetchRest(`/v1/albums/${albumId}/content/${contentId}`, {
		method: "DELETE",
	}).then((res) => res.assertOk());
}

export async function addDrawerMediaToAlbum({
	albumId,
	mediaIds,
}: {
	albumId: number;
	mediaIds: number[];
}) {
	await fetchRest(
		`/v1/albums/${albumId}/content/chat/list-by-id?isFresh=false`,
		{ method: "POST", body: { ids: mediaIds } },
	).then((res) => res.assertOk());
}

export async function reorderAlbumContent({
	albumId,
	contentIds,
}: {
	albumId: number;
	contentIds: number[];
}) {
	await fetchRest(`/v1/albums/${albumId}/content/order`, {
		method: "POST",
		body: { contentIds } satisfies AlbumContentOrderRequest,
	}).then((res) => res.assertOk());
}

function albumContentQuery(inspection: MediaFileInspection): string {
	if (inspection.kind !== "video") return "";
	const { width, height } = inspection;
	if (width === undefined || height === undefined) return "";
	return `width=${width}&height=${height}&`;
}

export async function uploadAlbumContent({
	albumId,
	media,
	inspection,
	limits,
	profileId,
	onHashed,
}: {
	albumId: number;
	media: PickedMedia;
	inspection: MediaFileInspection;
	limits: Pick<AlbumStorageLimits, "maxContentSize">;
	profileId: number;
	onHashed?: (sha256: string) => void;
}): Promise<{ contentId: number; sha256: string | null }> {
	if (demoEnabled) {
		const uploaded = demoUploadAlbumFile({
			albumId,
			kind: inspection.kind === "video" ? "video" : "photo",
		});
		onHashed?.(uploaded.sha256);
		return uploaded;
	}
	const file = mediaFileDescriptor(media);
	const { response, sha256 } = await uploadFileRest(
		`/v1/albums/${albumId}/content?${albumContentQuery(inspection)}isFresh=false`,
		{
			file,
			part: { name: "content", filename: "" },
			maxBodySize: limits.maxContentSize,
			profileId,
			onHashed,
		},
	);
	const { contentId } = response.jsonParsed(albumContentUploadResponseSchema);
	return { contentId, sha256 };
}

/**
 * The still frame the API made for a clip. An album read hands back a
 * `thumbUrl` for a clip too, but that one 404s until the transcode is done,
 * so a clip's tile is drawn from this instead.
 */
/**
 * Adds one framed photo to an album, from bytes rather than from the picked
 * file: the editor reframes a photo before it goes up, so what is uploaded
 * never exists on disk. Clips still take {@link uploadAlbumContent}, which
 * streams the file the picker handed over.
 *
 * This is the only upload in the API that takes `multipart/form-data`, which
 * the REST bridge has no way to send, so it goes through its own Tauri command.
 * The API answers a re-upload of the same bytes with the first upload's content
 * id instead of a second copy.
 */
export async function uploadAlbumPhotoBytes({
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
	return albumContentUploadResponseSchema.parse(response);
}

export async function getAlbumMediaPoster({
	albumId,
	contentId,
}: {
	albumId: number;
	contentId: number;
}) {
	return await fetchRest(
		`/v1/albums/${albumId}/content/${contentId}/poster`,
	).then((res) => res.jsonParsed(albumPosterSchema));
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
