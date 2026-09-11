import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	getCascadeV4Mock,
	callMethodMock,
	wsOnConnectedMock,
	getActiveGeohashSnapshotMock,
} = vi.hoisted(() => ({
	getCascadeV4Mock: vi.fn(),
	callMethodMock: vi.fn(),
	wsOnConnectedMock: vi.fn(),
	getActiveGeohashSnapshotMock: vi.fn(),
}));

vi.mock("$lib/api/browse/grid", () => ({ getCascadeV4: getCascadeV4Mock }));
vi.mock("$lib/api/methods", () => ({ callMethod: callMethodMock }));
vi.mock("$lib/ws.svelte", () => ({ ws: { onConnected: wsOnConnectedMock } }));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	getActiveGeohashSnapshot: getActiveGeohashSnapshotMock,
}));

import { decodeGeohash } from "$lib/model/geohash";
import {
	awaitEntitlementSeed,
	seedExpiringMediaEntitlement,
	startEntitlementMaintenance,
} from "./expiring-media-entitlement";
import { HONDURAS_INLAND_BOXES } from "./honduras";

/** A stand-in real location, distinct from the granting region. */
const HERE = "gcpvj0duq5s0";

/** The connect handler the module registered, so a test can fire (re)connects. */
let connectHandler: (() => void) | null = null;
const unlistenSpy = vi.fn();

const health = (expiresAt: number | null) =>
	Promise.resolve({ signedIn: true, expiresAt, stale: false });

/** Answers refresh_token and session_health; expiry is null unless overridden. */
function respond(expiresAt: number | null = null) {
	callMethodMock.mockImplementation((method: string) =>
		method === "session_health"
			? health(expiresAt)
			: Promise.resolve({ profileId: 1 }),
	);
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
	vi.clearAllMocks();
	getCascadeV4Mock.mockResolvedValue({});
	getActiveGeohashSnapshotMock.mockReturnValue(HERE);
	respond();
	connectHandler = null;
	wsOnConnectedMock.mockImplementation((handler: () => void) => {
		connectHandler = handler;
		return Promise.resolve(unlistenSpy);
	});
});

const insideHonduras = ({ lat, lon }: { lat: number; lon: number }) =>
	HONDURAS_INLAND_BOXES.some(
		(box) =>
			lat >= box.south &&
			lat <= box.north &&
			lon >= box.west &&
			lon <= box.east,
	);

describe("seedExpiringMediaEntitlement", () => {
	it("reports the granting region, re-establishes, then moves back", async () => {
		const order: string[] = [];
		getCascadeV4Mock.mockImplementation(
			(query: { nearbyGeoHash: string }) => {
				order.push(
					query.nearbyGeoHash === HERE
						? "cascade:here"
						: "cascade:grant",
				);
				return Promise.resolve({});
			},
		);
		callMethodMock.mockImplementation((method: string) => {
			if (method === "session_health") return health(null);
			order.push("refresh");
			return Promise.resolve({ profileId: 1 });
		});

		await seedExpiringMediaEntitlement(1);

		expect(order).toEqual(["cascade:grant", "refresh", "cascade:here"]);
		const [, seeded] = callMethodMock.mock.calls.find(
			([method]) => method === "refresh_token",
		) as [string, { geohash: string }];
		expect(insideHonduras(decodeGeohash(seeded.geohash))).toBe(true);
	});

	it("skips the move-back when there is no location yet", async () => {
		getActiveGeohashSnapshotMock.mockReturnValue(null);
		await seedExpiringMediaEntitlement(5);
		expect(getCascadeV4Mock).toHaveBeenCalledTimes(1);
	});

	it("skips a second seed within the cooldown", async () => {
		await seedExpiringMediaEntitlement(2);
		await seedExpiringMediaEntitlement(2);
		// One seed only: the granting cascade and the move-back, nothing repeated.
		expect(getCascadeV4Mock).toHaveBeenCalledTimes(2);
	});

	it("holds awaitEntitlementSeed until the in-flight seed finishes", async () => {
		let releaseRefresh!: (value: unknown) => void;
		callMethodMock.mockImplementation((method: string) =>
			method === "session_health"
				? health(null)
				: new Promise((resolve) => {
						releaseRefresh = resolve;
					}),
		);

		const seed = seedExpiringMediaEntitlement(3);
		let gateResolved = false;
		const gate = awaitEntitlementSeed().then(() => {
			gateResolved = true;
		});

		await Promise.resolve();
		await Promise.resolve();
		expect(gateResolved).toBe(false);

		releaseRefresh({ profileId: 3 });
		await seed;
		await gate;
		expect(gateResolved).toBe(true);
	});
});

describe("startEntitlementMaintenance", () => {
	it("re-seeds on a reconnect, skipping the first connect", async () => {
		respond(null);
		const stop = startEntitlementMaintenance(10);
		await flush();

		connectHandler?.(); // first connect — the establishing one, skipped
		await flush();
		expect(getCascadeV4Mock).not.toHaveBeenCalled();

		connectHandler?.(); // a real reconnect — re-seeds
		await flush();
		expect(getCascadeV4Mock).toHaveBeenCalled();

		stop();
	});

	it("stops re-seeding and unlistens after stop()", async () => {
		respond(null);
		const stop = startEntitlementMaintenance(11);
		await flush();
		stop();

		connectHandler?.();
		connectHandler?.();
		await flush();
		expect(getCascadeV4Mock).not.toHaveBeenCalled();
		expect(unlistenSpy).toHaveBeenCalledTimes(1);
	});

	describe("with fake timers", () => {
		beforeEach(() => vi.useFakeTimers());
		afterEach(() => vi.useRealTimers());

		it("renews ahead of the token's expiry", async () => {
			// Expires in 600s; renewal leads expiry by 120s → fires at ~480s.
			respond(Math.floor(Date.now() / 1000) + 600);
			const stop = startEntitlementMaintenance(12);
			await vi.advanceTimersByTimeAsync(0);
			expect(getCascadeV4Mock).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(480_000);
			expect(getCascadeV4Mock).toHaveBeenCalled();

			stop();
		});
	});
});
