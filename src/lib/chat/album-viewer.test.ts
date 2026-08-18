import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAlbumContentMock, getAlbumsPaywallContentMock, getMyAlbumsMock } =
	vi.hoisted(() => ({
		getAlbumContentMock: vi.fn(),
		getAlbumsPaywallContentMock: vi.fn(),
		getMyAlbumsMock: vi.fn(),
	}));

vi.mock("$lib/api/messaging/albums", () => ({
	getAlbumContent: getAlbumContentMock,
	getAlbumsPaywallContent: getAlbumsPaywallContentMock,
	getMyAlbums: getMyAlbumsMock,
}));
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("photoswipe/style.css", () => ({}));

import { AlbumLockedError, resolveAlbumForViewing } from "./album-viewer";
import { clearMyAlbumsCache } from "./my-albums";

function photo(contentId: number) {
	return {
		contentId,
		contentType: "image/jpeg",
		coverUrl: `https://cdn.example.com/${contentId}.cover`,
		statusId: 1,
		thumbUrl: `https://cdn.example.com/${contentId}.thumb`,
		url: `https://cdn.example.com/${contentId}.jpg`,
		processing: false,
		rejectionId: null,
	};
}

function myAlbumPayload(albumId: number) {
	return {
		albumId,
		albumName: "Mine",
		profileId: 42,
		version: 3,
		sharedCount: 0,
		createdAt: "2026-08-01T10:00:00",
		updatedAt: "2026-08-02T10:00:00",
		isShareable: true,
		content: [photo(1), photo(2)],
	};
}

beforeEach(() => {
	clearMyAlbumsCache();
	getAlbumContentMock.mockReset();
	getAlbumsPaywallContentMock.mockReset();
	getMyAlbumsMock.mockReset();
	getAlbumsPaywallContentMock.mockResolvedValue([]);
});

describe("resolveAlbumForViewing", () => {
	it("opens our own album from our album list once the share is off", async () => {
		getAlbumContentMock.mockResolvedValue({
			...myAlbumPayload(7),
			hasUnseenContent: false,
			albumViewable: false,
			content: [],
		});
		getMyAlbumsMock.mockResolvedValue([myAlbumPayload(7)]);

		const resolved = await resolveAlbumForViewing({
			albumId: 7,
			ownerProfileId: 42,
			ours: true,
		});

		expect(resolved.fromPaywall).toBe(false);
		expect(resolved.album.content.map((it) => it.url)).toEqual([
			"https://cdn.example.com/1.jpg",
			"https://cdn.example.com/2.jpg",
		]);
		// Ours never goes looking in the upsell teaser.
		expect(getAlbumsPaywallContentMock).not.toHaveBeenCalled();
	});

	it("skips the viewer endpoint for a locked bubble of ours", async () => {
		getMyAlbumsMock.mockResolvedValue([myAlbumPayload(7)]);

		const resolved = await resolveAlbumForViewing({
			albumId: 7,
			ownerProfileId: 42,
			viewable: false,
			ours: true,
		});

		expect(resolved.album.albumId).toBe(7);
		expect(getAlbumContentMock).not.toHaveBeenCalled();
	});

	it("reports an album of ours we no longer own as locked", async () => {
		getMyAlbumsMock.mockResolvedValue([]);

		await expect(
			resolveAlbumForViewing({ albumId: 7, viewable: false, ours: true }),
		).rejects.toBeInstanceOf(AlbumLockedError);
	});

	it("falls back to the teaser for somebody else's locked album", async () => {
		getAlbumsPaywallContentMock.mockResolvedValue([
			{
				albumId: 7,
				paywallCoverUrl: "https://cdn.example.com/7.cover",
				paywallUrls: ["https://cdn.example.com/7-a.cover"],
			},
		]);

		const resolved = await resolveAlbumForViewing({
			albumId: 7,
			ownerProfileId: 99,
			viewable: false,
		});

		expect(resolved.fromPaywall).toBe(true);
		expect(getMyAlbumsMock).not.toHaveBeenCalled();
	});
});
