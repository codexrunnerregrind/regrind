import { getCascadeV4 } from "$lib/api/browse/grid";
import { callMethod } from "$lib/api/methods";
import { getActiveGeohashSnapshot } from "$lib/app-data/preferences.svelte";
import { encodeGeohash } from "$lib/model/geohash";
import { ws } from "$lib/ws.svelte";

/**
 * Grindr gates expiring photos and message unsend by region, and refuses them
 * elsewhere. The server tracks the account's location from the grid it asks for,
 * and settles the session's feature set — these two among it — when the session
 * is established, holding it until the session is established again.
 *
 * This spot's region grants both. Asking for its grid records it as our
 * location, a refresh re-establishes the session against it, then the real
 * location is reported back — the automated equal of picking the spot,
 * relaunching, and moving back. Reporting it back matters beyond the grid: the
 * server would otherwise place us in the granting region for tap distances too,
 * until something next cascaded.
 *
 * The catch is the "until established again": the session's own token expires,
 * and the plain refresh that renews it reports the real location and re-locks
 * the two. So {@link startEntitlementMaintenance} keeps renewing the token
 * ahead of that, seeded from here, so the plain refresh never gets to.
 *
 * Coordinates 14.6531715, -87.2532523.
 */
const ENTITLEMENT_GEOHASH = encodeGeohash({
	lat: 14.6531715,
	lon: -87.2532523,
});

/** Renew this far ahead of the token's expiry, clear of the backend's own 60s
 * refresh buffer, so the seeded renewal always precedes the plain one. */
const EXPIRY_LEAD_MS = 120_000;
/** When the token carries no expiry to schedule against. */
const DEFAULT_INTERVAL_MS = 20 * 60_000;
/** Floor on the gap between seeds — long enough that the reconnect our own
 * refresh may cause can't loop back into another seed. */
const MIN_INTERVAL_MS = 60_000;

/** When each account was last seeded, for the cooldown above. */
const lastSeedAt = new Map<number, number>();

/** The seed in flight for each account, so the grid can wait on it. */
const inFlight = new Map<number, Promise<void>>();

function seed(profileId: number): Promise<void> {
	const existing = inFlight.get(profileId);
	if (existing) return existing;
	const run = (async () => {
		try {
			// Report the granting region the way picking that location does.
			await getCascadeV4({ nearbyGeoHash: ENTITLEMENT_GEOHASH });
			// Re-establish the session against it, the equal of relaunching
			// there, which settles the session's feature set and grants the two.
			await callMethod("refresh_token", { geohash: ENTITLEMENT_GEOHASH });
			lastSeedAt.set(profileId, Date.now());
			// Report the real location back — the "move back" step — so the
			// server stops placing us in the granting region for everything else
			// (tap and grid distances), while the grant, now on the token, holds.
			const here = getActiveGeohashSnapshot();
			if (here !== null) await getCascadeV4({ nearbyGeoHash: here });
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

function seededRecently(profileId: number): boolean {
	const at = lastSeedAt.get(profileId);
	return at !== undefined && Date.now() - at < MIN_INTERVAL_MS;
}

/**
 * Seeds the entitlements for `profileId` on establishment. Started (not awaited)
 * from the protected layout's load, so a switch lands on the new account at once
 * instead of hanging on this; {@link awaitEntitlementSeed} then holds the grid's
 * first request until it is done, moving the wait into the grid's own loading
 * state.
 *
 * Order matters: the granting region has to be the last one reported before the
 * session re-establishes, so the grid must not fetch its real-location grid in
 * between — which is what the gate guarantees. Best-effort and never throws.
 */
export function seedExpiringMediaEntitlement(profileId: number): Promise<void> {
	if (seededRecently(profileId)) {
		return inFlight.get(profileId) ?? Promise.resolve();
	}
	return seed(profileId);
}

/**
 * Resolves once any in-flight seed has finished, so the grid's cascade never
 * reports the real location before the seed's refresh has settled. Instant once
 * nothing is seeding, and never rejects.
 */
export function awaitEntitlementSeed(): Promise<void> {
	return Promise.all(inFlight.values()).then(() => undefined);
}

async function msUntilNextSeed(): Promise<number> {
	try {
		const health = await callMethod("session_health");
		if (health.expiresAt === null) return DEFAULT_INTERVAL_MS;
		const untilExpiry = health.expiresAt * 1000 - Date.now();
		return Math.max(MIN_INTERVAL_MS, untilExpiry - EXPIRY_LEAD_MS);
	} catch {
		return DEFAULT_INTERVAL_MS;
	}
}

/**
 * Keeps the grant alive for `profileId` while it is the active account.
 *
 * A seeded renewal lands before the token's own expiry, so the plain refresh
 * that would re-lock the features never runs; a reconnect (resume, network) that
 * skipped ahead of the timer re-asserts it too, guarded by the seed cooldown so
 * the renewal's own reconnect can't loop. Started per active account from the
 * protected layout; returns a stop function.
 */
export function startEntitlementMaintenance(profileId: number): () => void {
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const cycle = async (reseed: boolean) => {
		if (stopped) return;
		if (reseed && !seededRecently(profileId)) await seed(profileId);
		if (stopped) return;
		const delay = await msUntilNextSeed();
		if (stopped) return;
		if (timer !== null) clearTimeout(timer);
		timer = setTimeout(() => void cycle(true), delay);
	};

	// The layout's load already seeded on establishment; just schedule ahead.
	void cycle(false);

	// A reconnect the establishing seed itself provokes must not re-seed; the
	// cooldown covers it, and the first connect is skipped outright.
	let firstConnect = true;
	const unlisten = ws.onConnected(() => {
		if (firstConnect) {
			firstConnect = false;
			return;
		}
		void cycle(true);
	});

	return () => {
		stopped = true;
		if (timer !== null) clearTimeout(timer);
		void unlisten.then((stop) => stop());
	};
}
