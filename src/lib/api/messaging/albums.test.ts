import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRestMock } = vi.hoisted(() => ({ fetchRestMock: vi.fn() }));

vi.mock("$lib/api", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api")>()),
	fetchRest: fetchRestMock,
}));

import {
	getAlbumLimits,
	getAlbumsSharedByProfile,
	getMyAlbums,
	shareAlbum,
} from "$lib/api/messaging/albums";

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

beforeEach(() => {
	fetchRestMock.mockReset();
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

describe("getAlbumLimits", () => {
	it("parses the storage limits", async () => {
		const limits = {
			subscriptionType: "FreeAlbums",
			maxAlbums: 10,
			maxContentItemsPerAlbum: 30,
			maxShares: 100,
			maxViewableAlbums: 10,
			maxViewableVideos: 10,
			maxContentSizeInBytes: 125_829_120,
			maxContentSizeHumanReadable: "120.00 MB",
			maxVideoLength: 60,
			minVideoLength: 1,
			maxShareableAlbums: 10,
			maxVideosPerAlbum: 10,
		};
		fetchRestMock.mockResolvedValue(response(limits));

		await expect(getAlbumLimits()).resolves.toEqual(limits);
		expect(fetchRestMock).toHaveBeenCalledWith("/v1/albums/storage");
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
