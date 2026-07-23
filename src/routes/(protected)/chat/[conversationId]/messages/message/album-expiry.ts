import { formatDistanceStrict } from "date-fns";

/** Static labels for shares that carry a type but no concrete expiry stamp. */
const EXPIRATION_LABELS: Record<string, string> = {
	ONCE: "View once",
	TEN_MINUTES: "10 minutes",
	ONE_HOUR: "1 hour",
	ONE_DAY: "24 hours",
};

export type AlbumExpiry = { label: string; expired: boolean };

/**
 * The marker to show on an album in chat, or `null` when it never expires.
 *
 * `expirationType` is deliberately typed loosely: inbound messages keep it as a
 * plain string so an expiration type we don't recognise can't fail the parse,
 * which means an unknown value has to degrade to "no marker" here.
 */
export function albumExpiry(
	message: {
		viewableUntil?: number | null;
		expirationType?: string | null;
	},
	nowMs: number,
): AlbumExpiry | null {
	const { viewableUntil, expirationType } = message;

	// `expirationType` is the only field that declares an album expires at all.
	if (expirationType === undefined || expirationType === null) return null;
	const staticLabel = EXPIRATION_LABELS[expirationType];
	// Covers INDEFINITE and any type added server-side that we don't know.
	if (staticLabel === undefined) return null;

	// Deliberately *not* `expiresAt`: that stamp belongs to the signed media
	// URL and sits ~30 minutes out on every album, expiring or not, so counting
	// down from it showed "30 minutes left" even on 24 hour shares.
	// `viewableUntil` is the share's own deadline.
	const stamped = viewableUntil !== null && viewableUntil !== undefined;
	if (stamped && viewableUntil <= nowMs) {
		return { label: "Expired", expired: true };
	}

	// The API gives view-once shares a short window, but that window is when
	// the single view must happen, not a lifetime worth counting down.
	if (expirationType === "ONCE") return { label: "View once", expired: false };

	if (stamped) {
		return {
			label: `${formatDistanceStrict(viewableUntil, nowMs)} left`,
			expired: false,
		};
	}

	return { label: staticLabel, expired: false };
}
