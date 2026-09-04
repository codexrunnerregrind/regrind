import { getCascadeV4 } from "$lib/api/browse/grid";
import { callMethod } from "$lib/api/methods";
import { encodeGeohash } from "$lib/model/geohash";

/**
 * Grindr gates expiring photos and message unsend by region, and refuses them
 * elsewhere. The server tracks the account's location from the grid it asks for,
 * and settles the session's feature set — these two among it — when the session
 * is established. Reporting a granting region and then re-establishing there is
 * what unlocks them, after which they hold for the rest of the session.
 *
 * This spot's region grants both. Asking for its grid records it as our
 * location, then a refresh re-establishes the session against it — the automated
 * equal of picking the spot, relaunching, and moving back. The account's own
 * location drives the grid again straight after, and the features keep working
 * until sign-out.
 *
 * Coordinates 14.6531715, -87.2532523.
 */
const ENTITLEMENT_GEOHASH = encodeGeohash({
	lat: 14.6531715,
	lon: -87.2532523,
});

/**
 * Which accounts have already been seeded this run. The grant sticks for the
 * whole session, so one attempt per account is enough.
 */
const seeded = new Set<number>();

/** The seed in flight for each account, so the grid can wait on it. */
const inFlight = new Map<number, Promise<void>>();

/**
 * Seeds the expiring-media and unsend entitlements for `profileId`, once per
 * account per app run. Started (not awaited) from the protected layout's load,
 * so a switch lands on the new account at once instead of hanging on this;
 * {@link awaitEntitlementSeed} then holds the grid's first request until it is
 * done, moving the wait into the grid's own loading state.
 *
 * Order matters: the granting region has to be the last one reported before the
 * session re-establishes, so the grid must not fetch its real-location grid in
 * between — which is what the gate guarantees. Best-effort and never throws; a
 * failure just leaves the features as the server last had them and retries on
 * the next establishment.
 */
export function seedExpiringMediaEntitlement(profileId: number): Promise<void> {
	if (seeded.has(profileId)) return Promise.resolve();
	const existing = inFlight.get(profileId);
	if (existing) return existing;
	const run = (async () => {
		try {
			// Report the granting region the way picking that location does.
			await getCascadeV4({ nearbyGeoHash: ENTITLEMENT_GEOHASH });
			// Re-establish the session against it, the equal of relaunching
			// there, which settles the session's feature set and grants the two.
			await callMethod("refresh_token", { geohash: ENTITLEMENT_GEOHASH });
			seeded.add(profileId);
		} catch (error) {
			console.error(
				"[entitlements] could not seed the expiring-media gate",
				error,
			);
		} finally {
			inFlight.delete(profileId);
		}
	})();
	inFlight.set(profileId, run);
	return run;
}

/**
 * Resolves once any in-flight seed has finished, so the grid's cascade never
 * reports the real location before the seed's refresh has settled. Instant once
 * nothing is seeding, and never rejects.
 */
export function awaitEntitlementSeed(): Promise<void> {
	return Promise.all(inFlight.values()).then(() => undefined);
}
