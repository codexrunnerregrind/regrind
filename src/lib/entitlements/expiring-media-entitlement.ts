import {
	accountEpoch,
	isAccountEpochCurrent,
	registerAccountCache,
} from "$lib/api/account-caches";
import { updateLocation } from "$lib/api/browse/location";
import { errorUrn, tieredFeature } from "$lib/api/error-urn";
import { callMethod } from "$lib/api/methods";
import { getActiveGeohashSnapshot } from "$lib/app-data/preferences.svelte";
import { withDeadline } from "$lib/util/deadline";
import { randomHondurasGeohash } from "./honduras";

/**
 * Grindr gates expiring photos and unsend by region, checking both the token and
 * the location on record when the action runs. So a refused action is retried
 * while held in Honduras, and only then moved back (upstream #446).
 */

const STEP_TIMEOUT_MS = 10_000;
/** Moves back even if a retry hangs. */
const HOLD_TIMEOUT_MS = 15_000;
/** A refusal that survives the hold is real; don't hand over again. */
const MIN_INTERVAL_MS = 60_000;

type Hold = {
	holders: number;
	over: boolean;
	epoch: number;
	entered: Promise<void>;
	done: Promise<void>;
	finish: () => void;
	timer: ReturnType<typeof setTimeout>;
};

let current: Hold | null = null;
let refusedUnderHoldAt: number | null = null;

registerAccountCache({
	reset: () => {
		refusedUnderHoldAt = null;
	},
});

/** The 402s this grant lifts. */
export function isRegionGatedError(error: unknown): boolean {
	return (
		errorUrn(error) === "urn:gr:err:entitlement_limit" ||
		tieredFeature(error) === "UnsentMessage"
	);
}

function refusedRecently(): boolean {
	return (
		refusedUnderHoldAt !== null &&
		Date.now() - refusedUnderHoldAt < MIN_INTERVAL_MS
	);
}

async function enter(): Promise<void> {
	// A fresh point each time, so every install does not report one.
	const geohash = randomHondurasGeohash();
	await withDeadline({
		work: async () => {
			await updateLocation({ geohash });
			await callMethod("refresh_session", { geohash });
		},
		ms: STEP_TIMEOUT_MS,
	});
}

async function moveBack(epoch: number): Promise<void> {
	if (!isAccountEpochCurrent(epoch)) return;
	const here = getActiveGeohashSnapshot();
	if (here === null) return;
	await withDeadline({
		work: () => updateLocation({ geohash: here }),
		ms: STEP_TIMEOUT_MS,
	});
}

function close(hold: Hold): Promise<void> {
	if (hold.over) return hold.done;
	hold.over = true;
	clearTimeout(hold.timer);
	// Location writes stay ordered: the move back waits out the move there.
	void hold.entered
		.catch(() => undefined)
		.then(() => moveBack(hold.epoch))
		.catch((error: unknown) => {
			console.error("[entitlements] could not move back", error);
		})
		.finally(() => {
			if (current === hold) current = null;
			hold.finish();
		});
	return hold.done;
}

function open(after: Promise<void>): Hold {
	const { promise: done, resolve: finish } = Promise.withResolvers<void>();
	const hold: Hold = {
		holders: 0,
		over: false,
		epoch: accountEpoch(),
		entered: after.then(enter),
		done,
		finish,
		timer: setTimeout(() => void close(hold), HOLD_TIMEOUT_MS),
	};
	return hold;
}

/** Joins the hold in flight, or opens one once the last has moved back. */
function lease(): { entered: Promise<void>; release: () => void } {
	if (current === null || current.over) {
		current = open(current?.done ?? Promise.resolve());
	}
	const hold = current;
	hold.holders += 1;
	let released = false;
	return {
		entered: hold.entered,
		release: () => {
			if (released) return;
			released = true;
			hold.holders -= 1;
			if (hold.holders === 0) void close(hold);
		},
	};
}

/** Resolves once no hold is in flight or moving back; never rejects. */
export async function awaitEntitlementGrant(): Promise<void> {
	let hold: Hold | null;
	while ((hold = current) !== null) await hold.done;
}

/**
 * Runs `attempt`, and on a region-gated refusal runs it once more while held in
 * Honduras. The original refusal propagates when that fails, so the caller's
 * error handling is unchanged.
 */
export async function withRegionGrant<T>(
	attempt: () => Promise<T>,
): Promise<T> {
	try {
		return await attempt();
	} catch (error) {
		if (!isRegionGatedError(error) || refusedRecently()) throw error;
		const epoch = accountEpoch();
		const { entered, release } = lease();
		try {
			try {
				await entered;
			} catch (handoverError) {
				console.error("[entitlements] handover failed", handoverError);
				throw error;
			}
			if (!isAccountEpochCurrent(epoch)) throw error;
			try {
				return await attempt();
			} catch (retryError) {
				if (isRegionGatedError(retryError)) {
					refusedUnderHoldAt = Date.now();
				}
				throw retryError;
			}
		} finally {
			release();
		}
	}
}
