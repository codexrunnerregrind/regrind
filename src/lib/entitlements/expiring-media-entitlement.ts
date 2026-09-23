import {
	accountEpoch,
	isAccountEpochCurrent,
	registerAccountCache,
} from "$lib/api/account-caches";
import { getCascadeV4 } from "$lib/api/browse/grid";
import { errorUrn, tieredFeature } from "$lib/api/error-urn";
import { callMethod } from "$lib/api/methods";
import { getActiveGeohashSnapshot } from "$lib/app-data/preferences.svelte";
import { withDeadline } from "$lib/util/deadline";
import { randomHondurasGeohash } from "./honduras";

/**
 * Grindr gates expiring photos and message unsend by region, on the geohash the
 * session was refreshed against. Refreshing against a granting region, then
 * reporting the real location back, is the automated equal of picking the spot,
 * relaunching, and moving back.
 *
 * Claimed only when the server refuses an action, never at startup, and
 * {@link withRegionGrant} retries in place so nothing surfaces.
 */

const STEP_TIMEOUT_MS = 10_000;
/** A refusal that survives a fresh grant is real; don't hand over again. */
const MIN_INTERVAL_MS = 60_000;

let lastGrantAt: number | null = null;
let granting: Promise<void> | null = null;

registerAccountCache({
	reset: () => {
		lastGrantAt = null;
	},
});

/** The 402s this grant lifts. */
export function isRegionGatedError(error: unknown): boolean {
	return (
		errorUrn(error) === "urn:gr:err:entitlement_limit" ||
		tieredFeature(error) === "UnsentMessage"
	);
}

function grantedRecently(): boolean {
	return lastGrantAt !== null && Date.now() - lastGrantAt < MIN_INTERVAL_MS;
}

async function handover(): Promise<void> {
	// A fresh point each time, so every install does not report one.
	const geohash = randomHondurasGeohash();
	try {
		await withDeadline({
			work: async () => {
				await getCascadeV4({ nearbyGeoHash: geohash });
				await callMethod("refresh_session", { geohash });
			},
			ms: STEP_TIMEOUT_MS,
		});
		lastGrantAt = Date.now();
	} finally {
		// Move back, or the server keeps placing us there for tap and grid
		// distances; the grant is on the token by now.
		const here = getActiveGeohashSnapshot();
		if (here !== null) {
			await withDeadline({
				work: () => getCascadeV4({ nearbyGeoHash: here }),
				ms: STEP_TIMEOUT_MS,
			}).catch((error: unknown) => {
				console.error("[entitlements] could not move back", error);
			});
		}
	}
}

function grant(): Promise<void> {
	granting ??= handover().finally(() => {
		granting = null;
	});
	return granting;
}

/** Instant when no handover is in flight, and never rejects. */
export function awaitEntitlementGrant(): Promise<void> {
	return (granting ?? Promise.resolve()).catch(() => undefined);
}

/**
 * Runs `attempt`, and on a region-gated refusal claims the grant and runs it
 * once more. The original refusal propagates when that fails, so the caller's
 * error handling is unchanged.
 */
export async function withRegionGrant<T>(
	attempt: () => Promise<T>,
): Promise<T> {
	try {
		return await attempt();
	} catch (error) {
		if (!isRegionGatedError(error) || grantedRecently()) throw error;
		const epoch = accountEpoch();
		try {
			await grant();
		} catch (handoverError) {
			console.error("[entitlements] handover failed", handoverError);
			throw error;
		}
		if (!isAccountEpochCurrent(epoch)) throw error;
		return await attempt();
	}
}
