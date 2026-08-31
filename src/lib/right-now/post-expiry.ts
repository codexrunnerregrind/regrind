type Expiration = { expiration: number | null | undefined; nowMs: number };

/**
 * The stamp in milliseconds, or null when the API told us nothing useful.
 *
 * Normalised because everything else in the app is milliseconds, and a seconds
 * value read as milliseconds would read as decades rather than as an hour.
 */
function expiresAtMs(expiration: number | null | undefined): number | null {
	if (expiration === null || expiration === undefined) return null;
	return expiration < 1e12 ? expiration * 1000 : expiration;
}

/**
 * How long our own post has left, or null when the API told us nothing useful.
 *
 * Short by design — it goes on a button and in a pill, where "35 min left" fits
 * and "35 minutes left" wraps. Posts run an hour, so minutes is the ordinary
 * case and hours only shows in the first moments of one.
 */
export function postTimeLeft({ expiration, nowMs }: Expiration): string | null {
	const expiresAt = expiresAtMs(expiration);
	if (expiresAt === null) return null;
	const leftMs = expiresAt - nowMs;
	if (leftMs <= 0) return "Expired";
	// Rounded up: a post with 30 seconds on it has a minute left as far as anyone
	// reading a button is concerned, and "0 min left" is not a thing to show.
	const minutes = Math.ceil(leftMs / 60_000);
	if (minutes < 60) return `${minutes} min left`;
	return `${Math.round(minutes / 60)} hr left`;
}

/**
 * Whether the post's hour is up. A post with no stamp is not expired: an hour we
 * were never told about is not an hour we can call over.
 */
export function postExpired({ expiration, nowMs }: Expiration): boolean {
	const expiresAt = expiresAtMs(expiration);
	return expiresAt !== null && expiresAt <= nowMs;
}
