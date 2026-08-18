import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getMyAlbumsMock } = vi.hoisted(() => ({ getMyAlbumsMock: vi.fn() }));

vi.mock("$lib/api/messaging/albums", () => ({ getMyAlbums: getMyAlbumsMock }));

import { resetNowForTesting, setNowForTesting } from "$lib/util/clock";
import { clearMyAlbumCoverCache, myAlbumCoverUrl } from "./my-album-covers";

let clock = 0;

function album(albumId: number, content: unknown[]) {
	return { albumId, content };
}

function photo(overrides: Record<string, unknown> = {}) {
	return {
		coverUrl: "https://cdn.example.com/cover.jpg",
		thumbUrl: "https://cdn.example.com/thumb.jpg",
		...overrides,
	};
}

beforeEach(() => {
	clock = 1_000_000;
	setNowForTesting(() => clock);
	clearMyAlbumCoverCache();
	getMyAlbumsMock.mockReset();
});

afterEach(() => {
	resetNowForTesting();
});

describe("myAlbumCoverUrl", () => {
	it("is the first photo's cover", async () => {
		getMyAlbumsMock.mockResolvedValue([album(3, [photo()])]);

		await expect(myAlbumCoverUrl(3)).resolves.toBe(
			"https://cdn.example.com/cover.jpg",
		);
	});

	it("falls back to the thumb when the photo has no cover", async () => {
		getMyAlbumsMock.mockResolvedValue([
			album(3, [photo({ coverUrl: null })]),
		]);

		await expect(myAlbumCoverUrl(3)).resolves.toBe(
			"https://cdn.example.com/thumb.jpg",
		);
	});

	it("is null for an album we do not own", async () => {
		getMyAlbumsMock.mockResolvedValue([album(3, [photo()])]);

		await expect(myAlbumCoverUrl(9)).resolves.toBeNull();
	});

	it("is null for an album with nothing in it", async () => {
		getMyAlbumsMock.mockResolvedValue([album(3, [])]);

		await expect(myAlbumCoverUrl(3)).resolves.toBeNull();
	});

	it("answers every bubble from one request", async () => {
		getMyAlbumsMock.mockResolvedValue([
			album(3, [photo()]),
			album(4, [photo()]),
		]);

		const [first, second] = await Promise.all([
			myAlbumCoverUrl(3),
			myAlbumCoverUrl(4),
		]);

		expect(first).not.toBeNull();
		expect(second).not.toBeNull();
		expect(getMyAlbumsMock).toHaveBeenCalledTimes(1);
	});

	it("refetches once the signed urls have gone stale", async () => {
		getMyAlbumsMock.mockResolvedValue([album(3, [photo()])]);

		await myAlbumCoverUrl(3);
		clock += 11 * 60 * 1000;
		await myAlbumCoverUrl(3);

		expect(getMyAlbumsMock).toHaveBeenCalledTimes(2);
	});
});
