import { describe, expect, it, vi } from "vitest";

vi.mock("svelte-sonner", () => ({
	toast: { error: vi.fn(), success: vi.fn() },
}));

import { clearAccountCaches } from "$lib/api/account-caches";

/**
 * A module-level cache that is never registered survives the switch that was
 * supposed to drop it, and the next account is shown the previous one's data.
 * Both of these were exactly that, so they are pinned by name: the cache is
 * populated, the account is switched, and it has to come back empty.
 */
describe("module-level caches are dropped when the account changes", () => {
	it("forgets the albums we own", async () => {
		const albums = await import("$lib/chat/my-albums");
		const api = await import("$lib/api/messaging/albums");
		vi.spyOn(api, "getMyAlbums").mockResolvedValue([]);

		// Populate, then prove the populated state is what a switch clears.
		await albums.myAlbum(1);
		expect(api.getMyAlbums).toHaveBeenCalledTimes(1);
		await albums.myAlbum(1);
		expect(api.getMyAlbums).toHaveBeenCalledTimes(1);

		clearAccountCaches();

		await albums.myAlbum(1);
		expect(api.getMyAlbums).toHaveBeenCalledTimes(2);
	});

	it("forgets the taps we received", async () => {
		const taps = await import("$lib/interest/taps-state.svelte");
		const state = taps.getTapsState(1);
		// `loadCache` is what seeds a freshly built state from the module cache,
		// which is the path a switched-to account would come down.
		const seeded = () =>
			(state as unknown as { loadCache: () => unknown }).loadCache();

		(
			state as unknown as {
				applySnapshotReturningCoveredKeys: (s: unknown) => unknown;
			}
		).applySnapshotReturningCoveredKeys({ profiles: [] });
		expect(seeded()).not.toBeNull();

		clearAccountCaches();

		expect(seeded()).toBeNull();
	});
});
