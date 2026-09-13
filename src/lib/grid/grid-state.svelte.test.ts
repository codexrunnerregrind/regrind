import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getGridMock,
	getTagsMock,
	patchCachedProfileMock,
	reconcileHandlers,
	showErrorToastMock,
} = vi.hoisted(() => ({
	getGridMock: vi.fn(),
	getTagsMock: vi.fn(),
	patchCachedProfileMock: vi.fn(),
	reconcileHandlers: [] as (() => unknown)[],
	showErrorToastMock: vi.fn(),
}));

vi.mock("./grid", () => ({
	getGrid: getGridMock,
	getCachedProfile: () => undefined,
	patchCachedProfile: patchCachedProfileMock,
	resolveLazyProfile: vi.fn(),
	setCachedProfile: vi.fn(),
}));
vi.mock("$lib/api/users/tags", () => ({ getTags: getTagsMock }));
vi.mock("$lib/util/reconcile", () => ({
	reconciler: {
		subscribe: (handler: () => unknown) => {
			reconcileHandlers.push(handler);
			return () => {};
		},
	},
}));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferences: () => Promise.resolve({}),
	setPreferences: vi.fn(),
}));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));

import { clearAccountCaches } from "$lib/api/account-caches";
import {
	markProfileUnviewable,
	markProfileViewable,
} from "$lib/api/users/profile-viewability";
import { mergeProfileEditIntoCaches } from "$lib/api/users/profiles";
import { defaultFilters } from "$lib/model/browse/grid/filters";
import type { GridProfile } from "./grid";
import { gridState } from "./grid-state.svelte";

const page = (
	ids: number[],
	{ nextPage = null }: { nextPage?: number | null } = {},
) => ({ items: ids.map((id) => ({ id, type: "lazy" })), nextPage });

async function settle() {
	await vi.waitFor(() => expect(getGridMock).toHaveBeenCalled());
	await Promise.resolve();
}

beforeEach(async () => {
	clearAccountCaches();
	getGridMock.mockReset();
	getGridMock.mockResolvedValue(page([1]));
	gridState.reset();
	gridState.load("9q8yyk8ytpxr");
	await settle();
	getGridMock.mockReset();
	getGridMock.mockResolvedValue(page([2]));
});

describe("grid tag keys", () => {
	it("sends tag keys for tag texts saved by an older version", async () => {
		getTagsMock.mockResolvedValue([
			{
				language: "en",
				categoryCollection: [
					{
						text: "Fitness",
						possessiveText: null,
						tags: [{ tagId: 1, key: "gym", text: "Working Out" }],
					},
				],
			},
		]);
		gridState.filters.value = {
			...defaultFilters,
			tagsEnabled: true,
			tags: ["Working Out"],
		};

		gridState.retry();
		await settle();

		expect(getGridMock).toHaveBeenCalledWith(
			expect.objectContaining({ tags: ["gym"] }),
		);
	});
});

describe("grid reconciliation", () => {
	it("subscribes to the reconciler", () => {
		expect(reconcileHandlers).toHaveLength(1);
	});

	it("replaces the grid without emptying it first", async () => {
		const during: number[][] = [];
		getGridMock.mockImplementation(() => {
			during.push(gridState.items.map((item) => item.id));
			return Promise.resolve(page([2]));
		});

		await reconcileHandlers[0]?.();

		expect(during).toEqual([[1]]);
		expect(gridState.items.map((item) => item.id)).toEqual([2]);
		expect(gridState.loading).toBe(false);
	});

	it("does nothing until a location has been loaded", async () => {
		gridState.reset();

		await reconcileHandlers[0]?.();

		expect(getGridMock).not.toHaveBeenCalled();
	});
});

describe("grid blocking", () => {
	it("removes a tile whose profile became unviewable", () => {
		gridState.items = [
			{ type: "lazy", id: 1, unread: 0, isVisiting: false },
			{ type: "lazy", id: 2, unread: 0, isVisiting: false },
		];

		markProfileUnviewable(1);

		expect(gridState.items.map((item) => item.id)).toEqual([2]);
	});

	it("refetches the grid when a profile is unblocked", async () => {
		gridState.items = [
			{ type: "lazy", id: 1, unread: 0, isVisiting: false },
		];

		markProfileViewable(1);
		await settle();

		expect(gridState.items.map((item) => item.id)).toEqual([2]);
	});

	it("leaves the grid alone for a profile it does not hold", () => {
		gridState.items = [
			{ type: "lazy", id: 1, unread: 0, isVisiting: false },
		];

		markProfileUnviewable(3);

		expect(gridState.items.map((item) => item.id)).toEqual([1]);
	});
});

describe("grid favorites", () => {
	const PROFILE_ID = 100001;

	function rendered(isFavorite: boolean): GridProfile {
		return {
			type: "rendered",
			id: PROFILE_ID,
			displayName: "Ada",
			distance: 100,
			profilePhotosHashes: ["a"],
			unread: 0,
			onlineUntil: null,
			isFavorite,
			isVisiting: false,
			hasChattedInLast24Hrs: false,
			rightNow: null,
		};
	}

	function edit(isFavorite: boolean, profileId = PROFILE_ID) {
		mergeProfileEditIntoCaches({
			cacheProfileId: profileId,
			patch: { isFavorite },
		});
	}

	beforeEach(() => {
		patchCachedProfileMock.mockReset();
	});

	it("follows a favorite added and removed elsewhere, list and cache", () => {
		gridState.items = [rendered(false)];

		edit(true);

		expect(gridState.items[0]).toMatchObject({ isFavorite: true });
		expect(patchCachedProfileMock).toHaveBeenLastCalledWith({
			id: PROFILE_ID,
			patch: { isFavorite: true },
		});

		edit(false);

		expect(gridState.items[0]).toMatchObject({ isFavorite: false });
		expect(patchCachedProfileMock).toHaveBeenLastCalledWith({
			id: PROFILE_ID,
			patch: { isFavorite: false },
		});
	});

	it("ignores an edit that carries no favorite", () => {
		gridState.items = [rendered(false)];

		mergeProfileEditIntoCaches({
			cacheProfileId: PROFILE_ID,
			patch: { displayName: "Renamed" },
		});

		expect(patchCachedProfileMock).not.toHaveBeenCalled();
		expect(gridState.items[0]).toMatchObject({ isFavorite: false });
	});

	it("leaves an unresolved tile alone but still patches the cache", () => {
		gridState.items = [
			{ type: "lazy", id: PROFILE_ID, unread: 0, isVisiting: false },
		];

		edit(true);

		expect(gridState.items[0]).toEqual({
			type: "lazy",
			id: PROFILE_ID,
			unread: 0,
			isVisiting: false,
		});
		expect(patchCachedProfileMock).toHaveBeenCalledOnce();
	});
});

describe("loaded pages", () => {
	beforeEach(async () => {
		getGridMock.mockResolvedValueOnce(page([1, 2, 3], { nextPage: 1 }));
		gridState.retry();
		await settle();
		getGridMock.mockResolvedValueOnce(page([4, 5, 6], { nextPage: 2 }));
		await gridState.loadMore();
		getGridMock.mockResolvedValueOnce(page([7, 8, 9], { nextPage: 3 }));
		await gridState.loadMore();
		getGridMock.mockReset();
	});

	it("keeps pages past the first through a heartbeat beat", async () => {
		getGridMock.mockResolvedValue(page([1, 2, 3], { nextPage: 1 }));

		await gridState.refresh({ background: true });

		expect(gridState.items.map((item) => item.id)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9,
		]);
		expect(gridState.nextPage).toBe(3);
		expect(getGridMock).toHaveBeenCalledOnce();
	});

	it("keeps them through a reconcile too", async () => {
		getGridMock.mockResolvedValue(page([1, 2, 3], { nextPage: 1 }));

		await reconcileHandlers[0]?.();

		expect(gridState.items.map((item) => item.id)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9,
		]);
		expect(gridState.nextPage).toBe(3);
		expect(getGridMock).toHaveBeenCalledOnce();
	});

	it("lets the first page drop and reorder profiles, without duplicating", async () => {
		getGridMock.mockResolvedValue(page([3, 10, 7], { nextPage: 1 }));

		await gridState.refresh({ background: true });

		expect(gridState.items.map((item) => item.id)).toEqual([
			3, 10, 7, 4, 5, 6, 8, 9,
		]);
	});

	it("starts the grid over for a pull-to-refresh", async () => {
		getGridMock.mockResolvedValue(page([1, 2, 3], { nextPage: 1 }));

		await gridState.refresh({ keepLoadedPages: false });

		expect(gridState.items.map((item) => item.id)).toEqual([1, 2, 3]);
		expect(gridState.nextPage).toBe(1);
	});

	it("keeps a removed tile out of the kept pages", async () => {
		gridState.removeProfile(5);
		getGridMock.mockResolvedValue(page([1, 2, 3], { nextPage: 1 }));

		await gridState.refresh({ background: true });

		expect(gridState.items.map((item) => item.id)).toEqual([
			1, 2, 3, 4, 6, 7, 8, 9,
		]);
		expect(getGridMock).toHaveBeenCalledOnce();
	});

	it("stops paging once the shrunken grid runs out", async () => {
		getGridMock.mockResolvedValue(page([1, 2, 3], { nextPage: 1 }));
		await gridState.refresh({ background: true });

		getGridMock.mockResolvedValue(page([]));
		await gridState.loadMore();

		expect(getGridMock).toHaveBeenLastCalledWith(
			expect.objectContaining({ pageNumber: 3 }),
		);
		expect(gridState.nextPage).toBeNull();
		expect(gridState.items.map((item) => item.id)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9,
		]);
	});

	it("skips profiles the next page repeats after a kept refresh", async () => {
		getGridMock.mockResolvedValue(page([1, 2, 3], { nextPage: 1 }));
		await gridState.refresh({ background: true });

		getGridMock.mockResolvedValue(page([8, 10, 2, 11], { nextPage: 4 }));
		await gridState.loadMore();

		expect(gridState.items.map((item) => item.id)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
		]);
		expect(gridState.nextPage).toBe(4);
	});

	it("retries a failed refresh the way it was made", async () => {
		showErrorToastMock.mockClear();
		getGridMock.mockRejectedValueOnce(new Error("offline"));

		await gridState.refresh();

		const { onRetry } = showErrorToastMock.mock.calls[0]![0] as {
			onRetry: () => void;
		};
		getGridMock.mockResolvedValue(page([3, 1, 2], { nextPage: 1 }));
		onRetry();

		await vi.waitFor(() =>
			expect(gridState.items.map((item) => item.id)).toEqual([
				3, 1, 2, 4, 5, 6, 7, 8, 9,
			]),
		);
		expect(gridState.nextPage).toBe(3);
		expect(getGridMock).toHaveBeenCalledTimes(2);
	});
});
