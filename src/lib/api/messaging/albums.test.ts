import { encode } from "@msgpack/msgpack";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRestMock, invokeMock } = vi.hoisted(() => ({
	fetchRestMock: vi.fn(),
	invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
}));
vi.mock("$lib/api/transport", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/transport")>()),
	fetchRest: fetchRestMock,
}));

import { ApiError } from "$lib/api/api-error";
import {
	addDrawerMediaToAlbum,
	createAlbum,
	deleteAlbum,
	deleteAlbumContent,
	getAlbumContentProcessing,
	getAlbumShares,
	getAlbumsPaywallContent,
	getAlbumsSharedByProfile,
	getAlbumStorageLimits,
	getMyAlbums,
	getSharedAlbumsFeed,
	renameAlbum,
	reorderAlbumContent,
	shareAlbum,
	unshareAlbum,
	uploadAlbumContent,
	uploadAlbumPhotoBytes,
} from "$lib/api/messaging/albums";
import { toBase64 } from "$lib/util/base64";
import type { PickedMedia } from "$lib/platform/media-picker";

function albumContent(contentId = 1) {
	return {
		contentId,
		contentType: "image/jpeg",
		coverUrl: "https://example.com/cover.jpg",
		statusId: 1,
		thumbUrl: "https://example.com/thumb.jpg",
		url: "https://example.com/full.jpg",
		processing: false,
		rejectionId: null,
	};
}

function myAlbum(albumId = 1) {
	return {
		albumId,
		albumName: "Gym",
		profileId: 42,
		version: 1,
		content: [albumContent()],
		isShareable: true,
		sharedCount: 0,
		createdAt: "2026-03-27T20:39:00",
		updatedAt: "2026-03-27T20:39:00",
	};
}

function response(data?: unknown, status = 200) {
	return {
		status,
		assertOk() {
			if (status < 200 || status >= 300) {
				throw new Error(`mock assertOk rejected status ${status}`);
			}
		},
		jsonParsed: vi.fn((schema: { parse(value: unknown): unknown }) =>
			schema.parse(data),
		),
	};
}

// The shared pair the upstream-style tests drive: one response object whose
// body each test supplies through `jsonParsed`.
const assertOk = vi.fn();
const jsonParsed = vi.fn((schema: { parse: (value: unknown) => unknown }) =>
	schema.parse({}),
);

beforeEach(() => {
	fetchRestMock.mockReset();
	invokeMock.mockReset();
	assertOk.mockReset();
	jsonParsed.mockReset();
	jsonParsed.mockImplementation(
		(schema: { parse: (v: unknown) => unknown }) => schema.parse({}),
	);
	fetchRestMock.mockResolvedValue({ assertOk, jsonParsed });
});

describe("getMyAlbums", () => {
	it("requests the album list and unwraps it", async () => {
		fetchRestMock.mockResolvedValue(response({ albums: [myAlbum()] }));

		await expect(getMyAlbums()).resolves.toEqual([myAlbum()]);
		expect(fetchRestMock).toHaveBeenCalledWith("/v1/albums");
	});

	it("accepts a null album name", async () => {
		const album = { ...myAlbum(), albumName: null };
		fetchRestMock.mockResolvedValue(response({ albums: [album] }));

		await expect(getMyAlbums()).resolves.toEqual([album]);
	});
});

describe("addDrawerMediaToAlbum", () => {
	it("adds drawer media to an album by id, never as fresh", async () => {
		fetchRestMock.mockResolvedValue(response());

		await addDrawerMediaToAlbum({ albumId: 900, mediaIds: [5, 6] });

		expect(fetchRestMock).toHaveBeenCalledWith(
			"/v1/albums/900/content/chat/list-by-id?isFresh=false",
			{ method: "POST", body: { ids: [5, 6] } },
		);
	});
});

describe("getAlbumsSharedByProfile", () => {
	it("requests the profile's shared albums and unwraps them", async () => {
		const album = {
			albumId: 5,
			hasUnseenContent: true,
			albumName: "Shared",
			profileId: 42,
			albumViewable: true,
			expiresAt: null,
			expirationType: "INDEFINITE",
			content: {
				contentId: 500,
				contentType: "image/jpeg",
				coverUrl: "https://example.com/cover.jpg",
				statusId: 1,
			},
			contentCount: { imageCount: 3, videoCount: 1 },
		};
		fetchRestMock.mockResolvedValue(response({ albums: [album] }));

		await expect(getAlbumsSharedByProfile(42)).resolves.toEqual([album]);
		expect(fetchRestMock).toHaveBeenCalledWith("/v2/albums/shares/42");
	});

	it("tolerates a missing preview and counts", async () => {
		const album = {
			albumId: 5,
			hasUnseenContent: false,
			albumName: null,
			profileId: 42,
			albumViewable: false,
			expiresAt: null,
			expirationType: null,
		};
		fetchRestMock.mockResolvedValue(response({ albums: [album] }));

		await expect(getAlbumsSharedByProfile(42)).resolves.toEqual([album]);
	});
});

describe("createAlbum", () => {
	it("posts the name and returns the new album", async () => {
		fetchRestMock.mockResolvedValue(
			response({ albumId: 12, albumName: "Gym" }),
		);

		await expect(createAlbum({ albumName: "Gym" })).resolves.toEqual({
			albumId: 12,
			albumName: "Gym",
		});
		expect(fetchRestMock).toHaveBeenCalledWith("/v2/albums", {
			method: "POST",
			body: { albumName: "Gym" },
		});
	});

	it("surfaces the 402 returned at the album cap", async () => {
		fetchRestMock.mockResolvedValue(response(undefined, 402));

		await expect(createAlbum({ albumName: null })).rejects.toThrow(
			"mock assertOk rejected status 402",
		);
	});
});

describe("renameAlbum", () => {
	it("puts the new name", async () => {
		fetchRestMock.mockResolvedValue(
			response({ albumId: 12, albumName: null }),
		);

		await expect(
			renameAlbum({ albumId: 12, albumName: null }),
		).resolves.toEqual({ albumId: 12, albumName: null });
		expect(fetchRestMock).toHaveBeenCalledWith("/v2/albums/12", {
			method: "PUT",
			body: { albumName: null },
		});
	});
});

describe("deleteAlbum", () => {
	it("deletes by id", async () => {
		fetchRestMock.mockResolvedValue(response());

		await deleteAlbum({ albumId: 12 });

		expect(fetchRestMock).toHaveBeenCalledWith("/v1/albums/12", {
			method: "DELETE",
		});
	});
});

describe("reorderAlbumContent", () => {
	it("posts the full content order", async () => {
		fetchRestMock.mockResolvedValue(response());

		await reorderAlbumContent({ albumId: 12, contentIds: [3, 1, 2] });

		expect(fetchRestMock).toHaveBeenCalledWith(
			"/v1/albums/12/content/order",
			{ method: "POST", body: { contentIds: [3, 1, 2] } },
		);
	});
});

describe("deleteAlbumContent", () => {
	it("deletes a single item", async () => {
		fetchRestMock.mockResolvedValue(response());

		await deleteAlbumContent({ albumId: 12, contentId: 7 });

		expect(fetchRestMock).toHaveBeenCalledWith("/v1/albums/12/content/7", {
			method: "DELETE",
		});
	});
});

describe("getAlbumShares", () => {
	it("returns the shared-with profile ids", async () => {
		fetchRestMock.mockResolvedValue(response({ profileIds: [42, 43] }));

		await expect(getAlbumShares(12)).resolves.toEqual([42, 43]);
		expect(fetchRestMock).toHaveBeenCalledWith("/v1/albums/12/shares");
	});

	it("treats a missing list as no shares", async () => {
		fetchRestMock.mockResolvedValue(response({}));

		await expect(getAlbumShares(12)).resolves.toEqual([]);
	});
});

describe("unshareAlbum", () => {
	// `GET .../shares` hands back profile ids alone, so there is no share id to
	// echo: each entry carries a fresh one, as the official client sends.
	it("puts one entry per profile, each with its own share id", async () => {
		fetchRestMock.mockResolvedValue(response());

		await unshareAlbum({ albumId: 12, profileIds: [42, 43] });

		const [path, init] = fetchRestMock.mock.calls[0] as [
			string,
			{
				method: string;
				body: { profiles: { profileId: number; shareId: string }[] };
			},
		];
		expect(path).toBe("/v1/albums/12/unshares");
		expect(init.method).toBe("PUT");
		expect(init.body.profiles.map((profile) => profile.profileId)).toEqual([
			42, 43,
		]);
		expect(
			new Set(init.body.profiles.map((profile) => profile.shareId)).size,
		).toBe(2);
	});

	it("propagates a failed response", async () => {
		fetchRestMock.mockResolvedValue(response(undefined, 403));

		await expect(
			unshareAlbum({ albumId: 12, profileIds: [42] }),
		).rejects.toThrow("mock assertOk rejected status 403");
	});
});

describe("shareAlbum", () => {
	it("posts one entry per profile with the expiration", async () => {
		fetchRestMock.mockResolvedValue(response());

		await shareAlbum({
			albumId: 7,
			profileIds: [42, 43],
			expirationType: "ONE_HOUR",
		});

		expect(fetchRestMock).toHaveBeenCalledWith("/v4/albums/7/shares", {
			method: "POST",
			body: {
				profiles: [
					{ profileId: 42, expirationType: "ONE_HOUR" },
					{ profileId: 43, expirationType: "ONE_HOUR" },
				],
			},
		});
	});

	it("propagates a failed response", async () => {
		fetchRestMock.mockResolvedValue(response(undefined, 403));

		await expect(
			shareAlbum({
				albumId: 7,
				profileIds: [42],
				expirationType: "INDEFINITE",
			}),
		).rejects.toThrow("mock assertOk rejected status 403");
	});
});

describe("getSharedAlbumsFeed", () => {
	it("requests the shared-albums feed", async () => {
		fetchRestMock.mockResolvedValue(response({ sharedAlbums: [] }));

		await expect(getSharedAlbumsFeed()).resolves.toEqual({
			sharedAlbums: [],
		});
		expect(fetchRestMock).toHaveBeenCalledWith("/v3/pressie-albums/feed", {
			method: "POST",
			body: {},
		});
	});
});

describe("getAlbumsPaywallContent", () => {
	it("scopes the teaser to one profile and unwraps it", async () => {
		const entry = {
			albumId: 5,
			paywallCoverUrl: "https://example.com/cover.jpg",
			paywallUrls: ["https://example.com/1.jpg"],
			albumsItemCount: 1,
			profile: { profileId: 42 },
		};
		fetchRestMock.mockResolvedValue(
			response({ albumPaywallContent: [entry] }),
		);

		await expect(getAlbumsPaywallContent(42)).resolves.toEqual([entry]);
		expect(fetchRestMock).toHaveBeenCalledWith(
			"/v3/pressie-albums/feed/paywall/",
			{ method: "POST", body: { counterpartyId: 42 } },
		);
	});

	it("asks for every teased album when given no profile", async () => {
		fetchRestMock.mockResolvedValue(response({}));

		await expect(getAlbumsPaywallContent()).resolves.toEqual([]);
		expect(fetchRestMock).toHaveBeenCalledWith(
			"/v3/pressie-albums/feed/paywall/",
			{ method: "POST", body: { counterpartyId: null } },
		);
	});
});

describe("uploadAlbumPhotoBytes", () => {
	it("hands the bytes to the upload command, base64 encoded", async () => {
		invokeMock.mockResolvedValue({
			contentId: 7,
			contentUrl: "https://example.com/7.jpg",
		});

		await expect(
			uploadAlbumPhotoBytes({
				albumId: 3,
				bytes: new Uint8Array([1, 2, 3]),
				contentType: "image/png",
			}),
		).resolves.toEqual({
			contentId: 7,
			contentUrl: "https://example.com/7.jpg",
		});
		expect(invokeMock).toHaveBeenCalledWith("upload_album_content", {
			albumId: 3,
			contentType: "image/png",
			data: "AQID",
		});
		// Multipart never goes near the JSON bridge.
		expect(fetchRestMock).not.toHaveBeenCalled();
	});

	it("accepts an upload the API answered without a URL", async () => {
		invokeMock.mockResolvedValue({ contentId: 7, contentUrl: null });

		await expect(
			uploadAlbumPhotoBytes({
				albumId: 3,
				bytes: new Uint8Array([1]),
				contentType: "image/jpeg",
			}),
		).resolves.toEqual({ contentId: 7, contentUrl: null });
	});

	it("reads whether an uploaded album item is still processing", async () => {
		jsonParsed.mockImplementation(
			(schema: { parse: (v: unknown) => unknown }) =>
				schema.parse({ processing: true }),
		);

		const { processing } = await getAlbumContentProcessing({
			albumId: 900,
			contentId: 90001,
		});

		expect(fetchRestMock).toHaveBeenCalledWith(
			"/v1/albums/900/content/90001/processing",
		);
		expect(processing).toBe(true);
	});

	it("rejects a processing status without the processing flag", async () => {
		jsonParsed.mockImplementation(
			(schema: { parse: (v: unknown) => unknown }) => schema.parse({}),
		);

		await expect(
			getAlbumContentProcessing({ albumId: 900, contentId: 90001 }),
		).rejects.toThrow();
	});

	it("parses the storage limits a free account receives", async () => {
		jsonParsed.mockImplementation(
			(schema: { parse: (v: unknown) => unknown }) =>
				schema.parse({
					maxAlbums: 1,
					maxContentItemsPerAlbum: 10,
					maxContentSize: 125829120,
					maxContentSizeHumanReadable: "120.00 MB",
					maxShareableAlbums: 1,
					maxShares: 5000,
					maxVideoLength: 15000,
					maxVideosPerAlbum: 1,
					maxViewableAlbums: 5,
					maxViewableVideos: 1,
					minVideoLength: 1,
					subscriptionType: "FreeAlbums",
				}),
		);

		const limits = await getAlbumStorageLimits();

		expect(fetchRestMock).toHaveBeenCalledWith("/v1/albums/storage");
		expect(limits.maxContentSize).toBe(120 * 1024 * 1024);
		expect(limits.maxVideoLength).toBe(15000);
	});
});

const uploadLimits = { maxContentSize: 125829120 };

const pickedPhoto = {
	source: "desktop",
	key: "album-photo-1",
	mimeType: "image/png",
	path: "/tmp/photo.png",
} satisfies PickedMedia;

const pickedVideo = {
	source: "desktop",
	key: "album-video-1",
	mimeType: "video/quicktime",
	path: "/tmp/clip.mov",
} satisfies PickedMedia;

const photoInspection = { kind: "photo", size: 4096 } as const;
const videoInspection = {
	kind: "video",
	size: 8_000_000,
	width: 1080,
	height: 1920,
} as const;

const uploadSha =
	"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

function encodedUploadResponse(body: unknown) {
	return toBase64(
		encode({
			status: 200,
			body: new TextEncoder().encode(JSON.stringify(body)),
		}),
	);
}
describe("album content upload", () => {
	it("invokes the upload command with the part the server expects", async () => {
		invokeMock.mockResolvedValue({
			response: encodedUploadResponse({
				contentId: 90007,
				contentUrl: null,
			}),
			sha256: uploadSha,
			bodySize: 4321,
		});

		const uploaded = await uploadAlbumContent({
			albumId: 900,
			media: pickedPhoto,
			inspection: photoInspection,
			limits: uploadLimits,
			profileId: 123456,
		});

		expect(invokeMock).toHaveBeenCalledWith("upload_media_file", {
			file: { source: "desktop", path: "/tmp/photo.png" },
			request: {
				method: "POST",
				path: "/v1/albums/900/content?isFresh=false",
				part: { name: "content", filename: "" },
			},
			maxBodySize: 125829120,
			profileId: "123456",
		});
		expect(uploaded).toEqual({ contentId: 90007, sha256: uploadSha });
	});

	it("sends a video as mp4 with the dimensions the server needs", async () => {
		invokeMock.mockResolvedValue({
			response: encodedUploadResponse({
				contentId: 90008,
				contentUrl: null,
			}),
			sha256: uploadSha,
			bodySize: 8_000_400,
		});

		await uploadAlbumContent({
			albumId: 900,
			media: pickedVideo,
			inspection: videoInspection,
			limits: uploadLimits,
			profileId: 123456,
		});

		expect(invokeMock).toHaveBeenCalledWith("upload_media_file", {
			file: { source: "desktop", path: "/tmp/clip.mov" },
			request: {
				method: "POST",
				path: "/v1/albums/900/content?width=1080&height=1920&isFresh=false",
				part: { name: "content", filename: "" },
			},
			maxBodySize: 125829120,
			profileId: "123456",
		});
	});

	it("leaves the dimensions off a video it could not probe", async () => {
		invokeMock.mockResolvedValue({
			response: encodedUploadResponse({
				contentId: 90009,
				contentUrl: null,
			}),
			sha256: uploadSha,
			bodySize: 8_000_400,
		});

		await uploadAlbumContent({
			albumId: 900,
			media: pickedVideo,
			inspection: { kind: "video", size: 8_000_000 },
			limits: uploadLimits,
			profileId: 123456,
		});

		expect(invokeMock.mock.calls[0]?.[1]).toMatchObject({
			request: { path: "/v1/albums/900/content?isFresh=false" },
		});
	});

	it("reports the server's refusal when the hash never arrived", async () => {
		invokeMock.mockResolvedValue({
			response: toBase64(encode({ status: 413, body: new Uint8Array() })),
			sha256: null,
			bodySize: 8_000_400,
		});
		const onHashed = vi.fn();

		const error: unknown = await uploadAlbumContent({
			albumId: 900,
			media: pickedVideo,
			inspection: videoInspection,
			limits: uploadLimits,
			profileId: 123456,
			onHashed,
		}).catch((error: unknown) => error);

		expect(error).toBeInstanceOf(ApiError);
		expect((error as ApiError).response?.status).toBe(413);
		expect(onHashed).not.toHaveBeenCalled();
	});

	it("rejects a response that is not an upload result", async () => {
		invokeMock.mockResolvedValue({
			response: encodedUploadResponse({ contentUrl: null }),
			sha256: uploadSha,
			bodySize: 4321,
		});

		await expect(
			uploadAlbumContent({
				albumId: 900,
				media: pickedPhoto,
				inspection: photoInspection,
				limits: uploadLimits,
				profileId: 123456,
			}),
		).rejects.toThrow();
	});

	it("carries the too-large refusal through as an ApiError kind", async () => {
		invokeMock.mockRejectedValue({ kind: "ContentTooLarge" });

		const error: unknown = await uploadAlbumContent({
			albumId: 900,
			media: pickedPhoto,
			inspection: photoInspection,
			limits: uploadLimits,
			profileId: 123456,
		}).catch((error: unknown) => error);

		expect(error).toBeInstanceOf(ApiError);
		expect((error as ApiError).kind).toBe("ContentTooLarge");
	});
});
