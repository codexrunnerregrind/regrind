import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateLocationMock, callMethodMock, getActiveGeohashSnapshotMock } =
	vi.hoisted(() => ({
		updateLocationMock: vi.fn(),
		callMethodMock: vi.fn(),
		getActiveGeohashSnapshotMock: vi.fn(),
	}));

vi.mock("$lib/api/browse/location", () => ({
	updateLocation: updateLocationMock,
}));
vi.mock("$lib/api/methods", () => ({ callMethod: callMethodMock }));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	getActiveGeohashSnapshot: getActiveGeohashSnapshotMock,
}));

import { clearAccountCaches } from "$lib/api/account-caches";
import { ApiError } from "$lib/api/api-error";
import { decodeGeohash } from "$lib/model/geohash";
import {
	awaitEntitlementGrant,
	isRegionGatedError,
	withRegionGrant,
} from "./expiring-media-entitlement";
import { HONDURAS_INLAND_BOXES } from "./honduras";

/** A stand-in real location, distinct from the granting region. */
const HERE = "gcpvj0duq5s0";

function gateError(body: string): ApiError {
	return new ApiError({
		message: "refused",
		request: { method: "POST", path: "/v4/chat/message" },
		response: { status: 402, body },
	});
}

const LIMIT_BODY = JSON.stringify({ type: "urn:gr:err:entitlement_limit" });
const UNSEND_BODY = JSON.stringify({
	type: "urn:gr:err:tiered_feature",
	featureValue: "UnsentMessage",
});

const insideHonduras = ({ lat, lon }: { lat: number; lon: number }) =>
	HONDURAS_INLAND_BOXES.some(
		(box) =>
			lat >= box.south &&
			lat <= box.north &&
			lon >= box.west &&
			lon <= box.east,
	);

beforeEach(() => {
	vi.clearAllMocks();
	// Drops the grant cooldown left by the previous test.
	clearAccountCaches();
	updateLocationMock.mockResolvedValue(undefined);
	callMethodMock.mockResolvedValue({ profileId: 1 });
	getActiveGeohashSnapshotMock.mockReturnValue(HERE);
});

describe("isRegionGatedError", () => {
	it("knows the two refusals the grant lifts", () => {
		expect(isRegionGatedError(gateError(LIMIT_BODY))).toBe(true);
		expect(isRegionGatedError(gateError(UNSEND_BODY))).toBe(true);
		expect(isRegionGatedError(new Error("offline"))).toBe(false);
		expect(
			isRegionGatedError(
				gateError(JSON.stringify({ type: "urn:gr:err:banned" })),
			),
		).toBe(false);
	});
});

describe("withRegionGrant", () => {
	it("passes an attempt that succeeds through untouched", async () => {
		const attempt = vi.fn().mockResolvedValue("sent");
		await expect(withRegionGrant(attempt)).resolves.toBe("sent");
		expect(attempt).toHaveBeenCalledTimes(1);
		expect(updateLocationMock).not.toHaveBeenCalled();
	});

	it("retries while held in Honduras, then moves back", async () => {
		const order: string[] = [];
		updateLocationMock.mockImplementation(
			({ geohash }: { geohash: string }) => {
				order.push(geohash === HERE ? "move:here" : "move:grant");
				return Promise.resolve();
			},
		);
		callMethodMock.mockImplementation(() => {
			order.push("refresh");
			return Promise.resolve({ profileId: 1 });
		});
		const attempt = vi
			.fn()
			.mockImplementationOnce(() => {
				order.push("attempt");
				return Promise.reject(gateError(LIMIT_BODY));
			})
			.mockImplementation(() => {
				order.push("retry");
				return Promise.resolve("sent");
			});

		await expect(withRegionGrant(attempt)).resolves.toBe("sent");
		await awaitEntitlementGrant();

		expect(order).toEqual([
			"attempt",
			"move:grant",
			"refresh",
			"retry",
			"move:here",
		]);
		const [, seeded] = callMethodMock.mock.calls[0] as [
			string,
			{ geohash: string },
		];
		expect(insideHonduras(decodeGeohash(seeded.geohash))).toBe(true);
	});

	it("moves back after the retry even when it fails", async () => {
		const attempt = vi
			.fn()
			.mockRejectedValueOnce(gateError(UNSEND_BODY))
			.mockRejectedValueOnce(new Error("offline"));
		await expect(withRegionGrant(attempt)).rejects.toThrow("offline");
		await awaitEntitlementGrant();
		expect(updateLocationMock).toHaveBeenLastCalledWith({ geohash: HERE });
	});

	it("grants again for a later action once moved back", async () => {
		const refusedOnce = () =>
			vi
				.fn()
				.mockRejectedValueOnce(gateError(UNSEND_BODY))
				.mockResolvedValue("unsent");
		await withRegionGrant(refusedOnce());
		await awaitEntitlementGrant();
		await expect(withRegionGrant(refusedOnce())).resolves.toBe("unsent");
		expect(callMethodMock).toHaveBeenCalledTimes(2);
	});

	it("leaves an ungated failure alone", async () => {
		const error = new Error("offline");
		const attempt = vi.fn().mockRejectedValue(error);
		await expect(withRegionGrant(attempt)).rejects.toBe(error);
		expect(attempt).toHaveBeenCalledTimes(1);
		expect(updateLocationMock).not.toHaveBeenCalled();
	});

	it("reports the original refusal when the retry is refused too", async () => {
		const first = gateError(LIMIT_BODY);
		const attempt = vi
			.fn()
			.mockRejectedValueOnce(first)
			.mockRejectedValueOnce(gateError(LIMIT_BODY));
		await expect(withRegionGrant(attempt)).rejects.toBeInstanceOf(ApiError);
		expect(attempt).toHaveBeenCalledTimes(2);
	});

	it("does not hand over again after a refusal under the hold", async () => {
		await expect(
			withRegionGrant(vi.fn().mockRejectedValue(gateError(LIMIT_BODY))),
		).rejects.toBeInstanceOf(ApiError);
		await awaitEntitlementGrant();
		updateLocationMock.mockClear();

		const stillRefused = vi.fn().mockRejectedValue(gateError(LIMIT_BODY));
		await expect(withRegionGrant(stillRefused)).rejects.toBeInstanceOf(
			ApiError,
		);
		expect(stillRefused).toHaveBeenCalledTimes(1);
		expect(updateLocationMock).not.toHaveBeenCalled();
	});

	it("reports the refusal when the handover itself fails", async () => {
		const refusal = gateError(UNSEND_BODY);
		updateLocationMock.mockRejectedValue(new Error("no network"));
		const attempt = vi.fn().mockRejectedValue(refusal);
		await expect(withRegionGrant(attempt)).rejects.toBe(refusal);
		expect(attempt).toHaveBeenCalledTimes(1);
	});

	it("shares one handover between actions refused together", async () => {
		let releaseRefresh!: (value: unknown) => void;
		callMethodMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					releaseRefresh = resolve;
				}),
		);
		const attempt = () =>
			vi
				.fn()
				.mockRejectedValueOnce(gateError(LIMIT_BODY))
				.mockResolvedValue("sent");
		const first = attempt();
		const second = attempt();
		const runs = Promise.all([
			withRegionGrant(first),
			withRegionGrant(second),
		]);

		await vi.waitFor(() => expect(callMethodMock).toHaveBeenCalled());
		releaseRefresh({ profileId: 1 });
		await expect(runs).resolves.toEqual(["sent", "sent"]);

		expect(callMethodMock).toHaveBeenCalledTimes(1);
	});

	it("skips the move-back when there is no location yet", async () => {
		getActiveGeohashSnapshotMock.mockReturnValue(null);
		await withRegionGrant(
			vi
				.fn()
				.mockRejectedValueOnce(gateError(LIMIT_BODY))
				.mockResolvedValue("sent"),
		);
		await awaitEntitlementGrant();
		expect(updateLocationMock).toHaveBeenCalledTimes(1);
	});

	it("holds awaitEntitlementGrant until the handover finishes", async () => {
		let releaseRefresh!: (value: unknown) => void;
		callMethodMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					releaseRefresh = resolve;
				}),
		);
		const run = withRegionGrant(
			vi
				.fn()
				.mockRejectedValueOnce(gateError(LIMIT_BODY))
				.mockResolvedValue("sent"),
		);

		await vi.waitFor(() => expect(callMethodMock).toHaveBeenCalled());
		let gateResolved = false;
		const gate = awaitEntitlementGrant().then(() => {
			gateResolved = true;
		});
		await Promise.resolve();
		expect(gateResolved).toBe(false);

		releaseRefresh({ profileId: 1 });
		await run;
		await gate;
		expect(gateResolved).toBe(true);
	});
});
