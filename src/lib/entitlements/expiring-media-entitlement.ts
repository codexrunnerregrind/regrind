import { getCascadeV4 } from "$lib/api/browse/grid";
import { callMethod } from "$lib/api/methods";
import { getActiveGeohashSnapshot } from "$lib/app-data/preferences.svelte";
import { ws } from "$lib/ws.svelte";
import { randomHondurasGeohash } from "./honduras";

/**
 * Grindr gates expiring photos and message unsend by region. The server takes
 * the account's location from the grid it asks for and settles the session's
 * feature set when the session is established, so asking for a granting
 * region's grid, refreshing against it, then reporting the real location back
 * is the automated equal of picking the spot, relaunching, and moving back.
 *
 * The grant lives on the token, so {@link startEntitlementMaintenance} renews
 * it ahead of expiry — a plain refresh would report the real location and
 * re-lock both.
 */

/** Clear of the backend's own 60s refresh buffer, so ours goes first. */
const EXPIRY_LEAD_MS = 120_000;
const DEFAULT_INTERVAL_MS = 20 * 60_000;
/** Long enough that the reconnect our refresh causes cannot loop back here. */
const MIN_INTERVAL_MS = 60_000;

const lastSeedAt = new Map<number, number>();
const inFlight = new Map<number, Promise<void>>();

function seed(profileId: number): Promise<void> {
	const existing = inFlight.get(profileId);
	if (existing) return existing;
	const run = (async () => {
		try {
			// A fresh point each time, so every install does not report one.
			const granting = randomHondurasGeohash();
			await getCascadeV4({ nearbyGeoHash: granting });
			await callMethod("refresh_token", { geohash: granting });
			lastSeedAt.set(profileId, Date.now());
			// Move back, or the server keeps placing us there for tap and grid
			// distances; the grant is on the token by now.
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
 * Started but not awaited from the protected layout's load, so switching
 * account does not hang on it; {@link awaitEntitlementSeed} holds the grid
 * instead, which must not report the real location mid-seed. Never throws.
 */
export function seedExpiringMediaEntitlement(profileId: number): Promise<void> {
	if (seededRecently(profileId)) {
		return inFlight.get(profileId) ?? Promise.resolve();
	}
	return seed(profileId);
}

/** Instant when nothing is seeding, and never rejects. */
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
 * Renews ahead of the token's expiry so the plain refresh never runs, and
 * re-asserts after a reconnect that outran the timer. Returns a stop function.
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

	// The layout's load already seeded; just schedule ahead.
	void cycle(false);

	// The establishing seed provokes the first connect — skip it.
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
