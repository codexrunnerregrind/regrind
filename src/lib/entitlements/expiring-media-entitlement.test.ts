import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCascadeV4Mock, callMethodMock } = vi.hoisted(() => ({
	getCascadeV4Mock: vi.fn(),
	callMethodMock: vi.fn(),
}));

vi.mock("$lib/api/browse/grid", () => ({ getCascadeV4: getCascadeV4Mock }));
vi.mock("$lib/api/methods", () => ({ callMethod: callMethodMock }));

import {
	awaitEntitlementSeed,
	seedExpiringMediaEntitlement,
} from "./expiring-media-entitlement";

beforeEach(() => {
	vi.clearAllMocks();
	getCascadeV4Mock.mockResolvedValue({});
	callMethodMock.mockResolvedValue({ profileId: 1 });
});

describe("seedExpiringMediaEntitlement", () => {
	it("reports the granting region before re-establishing the session", async () => {
		const order: string[] = [];
		getCascadeV4Mock.mockImplementation(() => {
			order.push("cascade");
			return Promise.resolve({});
		});
		callMethodMock.mockImplementation(() => {
			order.push("refresh");
			return Promise.resolve({ profileId: 1 });
		});

		await seedExpiringMediaEntitlement(1);

		// A full-precision geohash for the granting region.
		expect(getCascadeV4Mock).toHaveBeenCalledWith({
			nearbyGeoHash: expect.stringMatching(/^[0-9b-hjkmnp-z]{12}$/),
		});
		expect(callMethodMock).toHaveBeenCalledWith("refresh_token", {
			geohash: expect.stringMatching(/^[0-9b-hjkmnp-z]{12}$/),
		});
		// The region has to be reported before the session re-establishes.
		expect(order).toEqual(["cascade", "refresh"]);
	});

	it("seeds each account only once per run", async () => {
		await seedExpiringMediaEntitlement(2);
		await seedExpiringMediaEntitlement(2);
		expect(getCascadeV4Mock).toHaveBeenCalledTimes(1);
	});

	it("retries on the next call when a step fails", async () => {
		getCascadeV4Mock.mockRejectedValueOnce(new Error("offline"));
		await seedExpiringMediaEntitlement(3);
		expect(callMethodMock).not.toHaveBeenCalled();

		await seedExpiringMediaEntitlement(3);
		expect(getCascadeV4Mock).toHaveBeenCalledTimes(2);
		expect(callMethodMock).toHaveBeenCalledTimes(1);
	});

	it("holds awaitEntitlementSeed until the in-flight seed finishes", async () => {
		let releaseRefresh!: (value: unknown) => void;
		callMethodMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					releaseRefresh = resolve;
				}),
		);

		const seed = seedExpiringMediaEntitlement(4);
		let gateResolved = false;
		const gate = awaitEntitlementSeed().then(() => {
			gateResolved = true;
		});

		// Cascade has resolved and the refresh is pending; the gate must wait.
		await Promise.resolve();
		await Promise.resolve();
		expect(gateResolved).toBe(false);

		releaseRefresh({ profileId: 4 });
		await seed;
		await gate;
		expect(gateResolved).toBe(true);
	});

	it("resolves awaitEntitlementSeed instantly when nothing is seeding", async () => {
		await expect(awaitEntitlementSeed()).resolves.toBeUndefined();
	});
});
