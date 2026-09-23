import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAlbumStorageLimits } = vi.hoisted(() => ({
	getAlbumStorageLimits: vi.fn(),
}));

vi.mock("$lib/api/messaging/albums", () => ({ getAlbumStorageLimits }));

import type { AlbumStorageLimits } from "$lib/model/messaging/albums";
import { AlbumLimits } from "./album-limits.svelte";

const caps = {
	subscriptionType: "FreeAlbums",
	maxAlbums: 5,
	maxContentItemsPerAlbum: 10,
	maxShares: 5000,
	maxViewableAlbums: 5,
	maxViewableVideos: 1,
	maxContentSize: 125829120,
	maxContentSizeHumanReadable: "120.00 MB",
	maxVideoLength: 15000,
	minVideoLength: 1,
	maxShareableAlbums: 1,
	maxVideosPerAlbum: 1,
} satisfies AlbumStorageLimits;

const photo = { contentType: "image/jpeg" };
const clip = { contentType: "video/mp4" };

async function readLimits(overrides: Partial<AlbumStorageLimits> = {}) {
	getAlbumStorageLimits.mockResolvedValue({ ...caps, ...overrides });
	const limits = new AlbumLimits();
	await limits.read();
	return limits;
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("what an album has room for", () => {
	it("claims nothing until the caps are read", () => {
		expect(new AlbumLimits().remaining([photo])).toBeNull();
	});

	it("counts photos and clips against the item cap, and clips against their own", async () => {
		const limits = await readLimits();

		expect(limits.remaining([photo, photo])).toEqual({
			items: 8,
			videos: 1,
		});
		expect(limits.remaining([photo, clip])).toEqual({
			items: 8,
			videos: 0,
		});
	});

	// A clip still takes an item, so the video slot of a full album is no room:
	// the header would otherwise read "0 left, of which 1 video".
	it("never offers a video slot the item cap has already closed", async () => {
		const limits = await readLimits({ maxContentItemsPerAlbum: 2 });

		expect(limits.remaining([photo, photo])).toEqual({
			items: 0,
			videos: 0,
		});
		expect(limits.remaining([photo])).toEqual({ items: 1, videos: 1 });
	});

	it("does not go below zero for an album over its caps", async () => {
		const limits = await readLimits({
			maxContentItemsPerAlbum: 1,
			maxVideosPerAlbum: 0,
		});

		expect(limits.remaining([photo, clip, clip])).toEqual({
			items: 0,
			videos: 0,
		});
	});

	it("reads the caps once, however often it is asked", async () => {
		const limits = await readLimits();

		await limits.read();
		await limits.read();

		expect(getAlbumStorageLimits).toHaveBeenCalledOnce();
	});

	it("stays silent about a read that fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		getAlbumStorageLimits.mockRejectedValue(new Error("offline"));
		const limits = new AlbumLimits();

		await limits.read();

		expect(limits.remaining([photo])).toBeNull();
	});
});
