import { getCascadeV4 } from "$lib/api/browse/grid";
import { getProfile, invalidateProfile } from "$lib/api/users/profiles";
import {
	getActiveGeohashSnapshot,
	getCurrentGeohashSnapshot,
} from "$lib/app-data/preferences.svelte";
import {
	coarsenGeohash,
	decodeGeohash,
	encodeGeohash,
} from "$lib/model/geohash";

// The server never hands out a user's coordinates — only a distance, measured
// from wherever we last told it we are. So a map pin has to be reconstructed:
// stand at a few known spots, read the distance from each, and intersect the
// circles. Every spot we report is snapped to a ~1/1000° grid before it leaves
// (see coarsenGeohash), so the vantages are spaced well past that and the pin is
// good to a block, not a doorstep.

const METRES_PER_DEGREE_LAT = 111_320;

/** Vantages are spread this far from the anchor, clamped to the target's range. */
const MIN_OFFSET_M = 300;
const MAX_OFFSET_M = 2000;

/**
 * Refine-pass ring radius around the rough fix. Kept above the ~110 m coarsening
 * step so the three points land in distinct grid cells, yet tight enough that
 * the target sits near the centre where the intersection is best conditioned.
 */
const REFINE_OFFSET_M = 250;

/** Conservative pacing: one request every this long, so the burst stays gentle. */
const REQUEST_SPACING_MS = 2500;

/** Reuse a fix for this long rather than re-sampling the same profile. */
const CACHE_TTL_MS = 5 * 60 * 1000;

export type LocationEstimate = {
	lat: number;
	lon: number;
	/** Rough 1σ radius of the fix, in metres. */
	accuracyM: number;
};

export class LocationUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "LocationUnavailableError";
	}
}

const cache = new Map<number, { at: number; estimate: LocationEstimate }>();

const sleep = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

function metresPerDegreeLon(lat: number): number {
	return METRES_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);
}

/** The point the server actually sees after our geohash is coarsened. */
function reportedPoint(lat: number, lon: number): { lat: number; lon: number } {
	const { lat: rLat, lon: rLon } = decodeGeohash(
		coarsenGeohash(encodeGeohash({ lat, lon })),
	);
	return { lat: rLat, lon: rLon };
}

/**
 * Reports our position at `geohash`, then reads how far `profileId` is from
 * there. The cascade both moves our server-side location and usually already
 * carries the target (we are standing next to them), so the extra profile fetch
 * only happens when it does not.
 *
 * With `float`, the profile is always fetched: the cascade only reports distance
 * to the metre, while the profile carries it as a float — worth the extra
 * request on the refine pass, where sub-metre precision tightens the fix.
 */
async function distanceFrom(
	geohash: string,
	profileId: number,
	{ float = false }: { float?: boolean } = {},
): Promise<number | null> {
	const cascade = await getCascadeV4({ nearbyGeoHash: geohash });
	if (!float) {
		for (const item of cascade.items) {
			if (
				(item.type === "full_profile_v1" ||
					item.type === "partial_profile_v1" ||
					item.type === "hidden_profile_v1" ||
					item.type === "smart_boost_profile_v1") &&
				item.data.profileId === profileId &&
				item.data.distanceMeters !== undefined
			) {
				return item.data.distanceMeters;
			}
		}
	}
	invalidateProfile(profileId);
	const profile = await getProfile(profileId);
	return profile.distance;
}

/**
 * Solves for the point whose distances to each sample best match the measured
 * ones. Linearises against the first sample and least-squares the rest, so it
 * tolerates the metre-level noise the coarsening leaves behind.
 */
function solve(
	samples: { lat: number; lon: number; distance: number }[],
	anchor: { lat: number; lon: number },
): LocationEstimate {
	const mPerLon = metresPerDegreeLon(anchor.lat);
	const local = samples.map((s) => ({
		x: (s.lon - anchor.lon) * mPerLon,
		y: (s.lat - anchor.lat) * METRES_PER_DEGREE_LAT,
		d: s.distance,
	}));

	const [ref, ...rest] = local;
	if (!ref) throw new LocationUnavailableError("No distance samples");

	// 2(xi-x0)X + 2(yi-y0)Y = (xi²+yi²-di²) - (x0²+y0²-d0²)
	let a11 = 0,
		a12 = 0,
		a22 = 0,
		b1 = 0,
		b2 = 0;
	const k0 = ref.x * ref.x + ref.y * ref.y - ref.d * ref.d;
	for (const p of rest) {
		const ax = 2 * (p.x - ref.x);
		const ay = 2 * (p.y - ref.y);
		const bi = p.x * p.x + p.y * p.y - p.d * p.d - k0;
		a11 += ax * ax;
		a12 += ax * ay;
		a22 += ay * ay;
		b1 += ax * bi;
		b2 += ay * bi;
	}

	const det = a11 * a22 - a12 * a12;
	if (Math.abs(det) < 1e-6)
		throw new LocationUnavailableError(
			"Could not resolve a position from the distances",
		);

	const x = (b1 * a22 - b2 * a12) / det;
	const y = (a11 * b2 - a12 * b1) / det;

	// Accuracy: RMS of how far each measured circle misses the solved point.
	let sq = 0;
	for (const p of local) {
		const predicted = Math.hypot(p.x - x, p.y - y);
		sq += (predicted - p.d) ** 2;
	}
	const accuracyM = Math.sqrt(sq / local.length);

	return {
		lat: anchor.lat + y / METRES_PER_DEGREE_LAT,
		lon: anchor.lon + x / mPerLon,
		accuracyM,
	};
}

type Sample = { lat: number; lon: number; distance: number };

/**
 * Reads the target's distance from three points ringing `centre` at `offset`
 * metres, paced one request apart. Each reported point is recorded as the
 * server actually saw it (post-coarsening), so the solver works from true
 * positions. With `float`, distances come from the profile fetch for precision.
 */
async function sampleRing(
	centre: { lat: number; lon: number },
	offset: number,
	profileId: number,
	{ float = false, signal }: { float?: boolean; signal?: AbortSignal } = {},
): Promise<Sample[]> {
	const dLat = offset / METRES_PER_DEGREE_LAT;
	const dLon = offset / metresPerDegreeLon(centre.lat);
	const vantages = [
		{ lat: centre.lat + dLat, lon: centre.lon }, // N
		{ lat: centre.lat, lon: centre.lon + dLon }, // E
		{ lat: centre.lat - dLat, lon: centre.lon - dLon }, // SW
	];

	const samples: Sample[] = [];
	for (const v of vantages) {
		if (signal?.aborted) throw new LocationUnavailableError("Cancelled");
		await sleep(REQUEST_SPACING_MS);
		const distance = await distanceFrom(encodeGeohash(v), profileId, {
			float,
		});
		if (distance !== null)
			samples.push({ ...reportedPoint(v.lat, v.lon), distance });
	}
	return samples;
}

/**
 * Estimates where `profileId` is in two passes. Pass one rings our current
 * location to get a rough fix; pass two rings that fix tightly, reading float
 * distances, to sharpen it. Sequential and paced so it never bursts the server,
 * and it leaves our reported location where it found it.
 */
export async function estimateProfileLocation(
	profileId: number,
	{ signal }: { signal?: AbortSignal } = {},
): Promise<LocationEstimate> {
	const cached = cache.get(profileId);
	if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.estimate;

	const originGeohash =
		getActiveGeohashSnapshot() ?? getCurrentGeohashSnapshot();
	if (!originGeohash)
		throw new LocationUnavailableError(
			"Set your own location first, then try again",
		);

	const anchor = decodeGeohash(originGeohash);

	try {
		// Pass 1: one reading here to gauge range, then a ring scaled to it —
		// wide enough that the distance swings clearly, past the grid snap.
		const anchorDistance = await distanceFrom(originGeohash, profileId);
		if (anchorDistance === null)
			throw new LocationUnavailableError(
				"This user does not share their distance",
			);

		const offset = Math.min(
			MAX_OFFSET_M,
			Math.max(MIN_OFFSET_M, anchorDistance * 0.7),
		);
		const samples: Sample[] = [
			{
				...reportedPoint(anchor.lat, anchor.lon),
				distance: anchorDistance,
			},
			...(await sampleRing(anchor, offset, profileId, { signal })),
		];
		if (samples.length < 3)
			throw new LocationUnavailableError(
				"Could not gather enough readings to place this user",
			);
		const rough = solve(samples, anchor);

		// Pass 2: ring the rough fix closely, with float distances, and solve
		// again over every reading for a tighter result.
		samples.push(
			...(await sampleRing(rough, REFINE_OFFSET_M, profileId, {
				float: true,
				signal,
			})),
		);

		const estimate = solve(samples, rough);
		cache.set(profileId, { at: Date.now(), estimate });
		return estimate;
	} finally {
		// Put the server back where it thought we were.
		await sleep(REQUEST_SPACING_MS);
		await getCascadeV4({ nearbyGeoHash: originGeohash }).catch(() => {});
	}
}
