import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getAlbumSharesMock } = vi.hoisted(() => ({
	getAlbumSharesMock: vi.fn(),
}));

vi.mock("$lib/api/messaging/albums", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/messaging/albums")>()),
	getAlbumShares: getAlbumSharesMock,
}));

import {
	clearAlbumShareState,
	ensureAlbumSharesSwept,
	getAlbumShared,
	setAlbumShared,
} from "$lib/api/messaging/album-shares-state.svelte";
import { resetNowForTesting, setNowForTesting } from "$lib/util/clock";

const ALBUMS = [{ albumId: 1 }, { albumId: 2 }];

beforeEach(() => {
	getAlbumSharesMock.mockReset();
});

afterEach(() => {
	clearAlbumShareState();
	resetNowForTesting();
});

describe("album share state", () => {
	it("reports unknown for an album it has never seen", () => {
		expect(getAlbumShared(1, 42)).toBeUndefined();
	});

	it("distinguishes unknown from known-unshared", () => {
		setAlbumShared(1, 42, false);

		expect(getAlbumShared(1, 42)).toBe(false);
		expect(getAlbumShared(2, 42)).toBeUndefined();
	});

	it("keys on the profile as well as the album", () => {
		setAlbumShared(1, 42, true);

		expect(getAlbumShared(1, 42)).toBe(true);
		expect(getAlbumShared(1, 43)).toBeUndefined();
	});
});

describe("ensureAlbumSharesSwept", () => {
	it("records which albums are shared with the profile", async () => {
		getAlbumSharesMock.mockImplementation((albumId: number) =>
			Promise.resolve(albumId === 1 ? [42, 43] : [43]),
		);

		await ensureAlbumSharesSwept(42, ALBUMS);

		expect(getAlbumShared(1, 42)).toBe(true);
		expect(getAlbumShared(2, 42)).toBe(false);
	});

	it("does not sweep again within the TTL, and does after it", async () => {
		let clock = 1_000;
		setNowForTesting(() => clock);
		getAlbumSharesMock.mockResolvedValue([]);

		await ensureAlbumSharesSwept(42, ALBUMS);
		expect(getAlbumSharesMock).toHaveBeenCalledTimes(2);

		await ensureAlbumSharesSwept(42, ALBUMS);
		expect(getAlbumSharesMock).toHaveBeenCalledTimes(2);

		clock += 60_000;
		await ensureAlbumSharesSwept(42, ALBUMS);
		expect(getAlbumSharesMock).toHaveBeenCalledTimes(4);
	});

	it("shares one sweep between concurrent callers", async () => {
		getAlbumSharesMock.mockResolvedValue([]);

		await Promise.all([
			ensureAlbumSharesSwept(42, ALBUMS),
			ensureAlbumSharesSwept(42, ALBUMS),
			ensureAlbumSharesSwept(42, ALBUMS),
		]);

		expect(getAlbumSharesMock).toHaveBeenCalledTimes(ALBUMS.length);
	});

	it("keeps going when one album's lookup fails", async () => {
		getAlbumSharesMock.mockImplementation((albumId: number) =>
			albumId === 1 ? Promise.reject(new Error("nope")) : Promise.resolve([42]),
		);

		await ensureAlbumSharesSwept(42, ALBUMS);

		expect(getAlbumShared(1, 42)).toBeUndefined();
		expect(getAlbumShared(2, 42)).toBe(true);
	});

	it("retries after a wholesale failure instead of caching it as checked", async () => {
		setNowForTesting(() => 1_000);
		getAlbumSharesMock.mockRejectedValue(new Error("offline"));

		await ensureAlbumSharesSwept(42, ALBUMS);
		expect(getAlbumSharesMock).toHaveBeenCalledTimes(2);

		// Still within the TTL, but nothing landed, so it must try again.
		getAlbumSharesMock.mockResolvedValue([42]);
		await ensureAlbumSharesSwept(42, ALBUMS);

		expect(getAlbumSharesMock).toHaveBeenCalledTimes(4);
		expect(getAlbumShared(1, 42)).toBe(true);
	});

	it("tracks profiles separately", async () => {
		setNowForTesting(() => 1_000);
		getAlbumSharesMock.mockResolvedValue([]);

		await ensureAlbumSharesSwept(42, ALBUMS);
		await ensureAlbumSharesSwept(43, ALBUMS);

		expect(getAlbumSharesMock).toHaveBeenCalledTimes(4);
	});
});
