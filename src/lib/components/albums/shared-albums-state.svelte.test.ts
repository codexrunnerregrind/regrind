import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSharedAlbumsFeedMock, removeAlbumShareMock } = vi.hoisted(() => ({
	getSharedAlbumsFeedMock: vi.fn(),
	removeAlbumShareMock: vi.fn(),
}));

vi.mock("$lib/api/messaging/albums", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/messaging/albums")>()),
	getSharedAlbumsFeed: getSharedAlbumsFeedMock,
	removeAlbumShare: removeAlbumShareMock,
}));

import { SharedAlbumsState } from "$lib/components/albums/shared-albums-state.svelte";
import { resetNowForTesting, setNowForTesting } from "$lib/util/clock";

function feed(albumIds: number[], hasUnseenContent = false) {
	return {
		sharedAlbums: albumIds.map((albumId) => ({
			albumId,
			hasUnseenContent,
			albumViewable: true,
		})),
	};
}

let clock = 1_000;

beforeEach(() => {
	clock = 1_000;
	setNowForTesting(() => clock);
	getSharedAlbumsFeedMock.mockReset();
	removeAlbumShareMock.mockReset();
	removeAlbumShareMock.mockResolvedValue(undefined);
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	resetNowForTesting();
	vi.restoreAllMocks();
});

describe("shared albums state", () => {
	it("fetches on the first mount only, while the cache is fresh", async () => {
		getSharedAlbumsFeedMock.mockResolvedValue(feed([1, 2]));
		const state = new SharedAlbumsState();

		state.ensureLoaded();
		await vi.waitFor(() => expect(state.albums).toHaveLength(2));

		state.ensureLoaded();
		state.ensureLoaded();
		expect(getSharedAlbumsFeedMock).toHaveBeenCalledTimes(1);
	});

	it("revalidates a mount once the cache has aged out", async () => {
		getSharedAlbumsFeedMock.mockResolvedValue(feed([1]));
		const state = new SharedAlbumsState();

		state.ensureLoaded();
		await vi.waitFor(() => expect(state.albums).toHaveLength(1));

		clock += 60_000;
		getSharedAlbumsFeedMock.mockResolvedValue(feed([1, 2]));
		state.ensureLoaded();
		// The stale list stays on screen while the new one is on its way.
		expect(state.albums).toHaveLength(1);
		await vi.waitFor(() => expect(state.albums).toHaveLength(2));
	});

	it("shares one request between callers that arrive together", async () => {
		getSharedAlbumsFeedMock.mockResolvedValue(feed([1]));
		const state = new SharedAlbumsState();

		await Promise.all([state.refresh(), state.refresh(), state.refresh()]);

		expect(getSharedAlbumsFeedMock).toHaveBeenCalledTimes(1);
	});

	it("surfaces a first-load failure and retries it", async () => {
		getSharedAlbumsFeedMock.mockRejectedValue(new Error("offline"));
		const state = new SharedAlbumsState();

		await state.refresh();
		expect(state.error).toBeInstanceOf(Error);
		expect(state.albums).toBeNull();

		getSharedAlbumsFeedMock.mockResolvedValue(feed([1]));
		await state.refresh();

		expect(state.error).toBeNull();
		expect(state.albums).toHaveLength(1);
	});

	it("keeps the cached list when a refresh fails", async () => {
		getSharedAlbumsFeedMock.mockResolvedValue(feed([1]));
		const state = new SharedAlbumsState();
		await state.refresh();

		getSharedAlbumsFeedMock.mockRejectedValue(new Error("offline"));
		await state.refresh();

		expect(state.albums).toHaveLength(1);
		expect(state.error).toBeNull();
		expect(state.refreshing).toBe(false);
	});

	it("retries a failed load instead of treating it as fresh", async () => {
		getSharedAlbumsFeedMock.mockRejectedValue(new Error("offline"));
		const state = new SharedAlbumsState();

		state.ensureLoaded();
		await vi.waitFor(() => expect(state.error).toBeInstanceOf(Error));

		state.ensureLoaded();
		expect(getSharedAlbumsFeedMock).toHaveBeenCalledTimes(2);
	});

	it("clears the unseen dot for the album that was opened", async () => {
		getSharedAlbumsFeedMock.mockResolvedValue(feed([1, 2], true));
		const state = new SharedAlbumsState();
		await state.refresh();

		state.markSeen(1);

		expect(state.albums?.[0]?.hasUnseenContent).toBe(false);
		expect(state.albums?.[1]?.hasUnseenContent).toBe(true);
	});

	it("drops a removed share from the list", async () => {
		getSharedAlbumsFeedMock.mockResolvedValue(feed([1, 2]));
		const state = new SharedAlbumsState();

		state.ensureLoaded();
		await vi.waitFor(() => expect(state.albums).toHaveLength(2));

		await state.remove(1);

		expect(removeAlbumShareMock).toHaveBeenCalledWith({ albumId: 1 });
		expect(state.albums?.map((album) => album.albumId)).toEqual([2]);
	});

	it("puts the album back when removing it fails", async () => {
		getSharedAlbumsFeedMock.mockResolvedValue(feed([1, 2]));
		removeAlbumShareMock.mockRejectedValue(new Error("nope"));
		const state = new SharedAlbumsState();

		state.ensureLoaded();
		await vi.waitFor(() => expect(state.albums).toHaveLength(2));

		await expect(state.remove(1)).rejects.toThrow("nope");
		expect(state.albums?.map((album) => album.albumId)).toEqual([1, 2]);
	});
});
