import { SvelteMap } from "svelte/reactivity";

import { registerAccountCache } from "$lib/api/account-caches";
import { TapType } from "$lib/model/interest/taps";

/**
 * How long a tap or a chat keeps announcing itself on the other person's
 * profile.
 *
 * The profile payload's `lastReceivedTapTimestamp` and `lastChatTimestamp`
 * never expire, so without a window a profile tapped last spring would still
 * greet you with a banner. Either is a nudge — worth surfacing while answering
 * it still reads as an answer, and noise after that.
 */
export const RECENT_ACTIVITY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type ReceivedTap = { timestamp: number; tapType: TapType | null };

/**
 * The most recent tap each profile sent us, keyed by profile id.
 *
 * The profile payload says *when* somebody tapped but not *with what* — its own
 * `tapType` is the tap we sent them — so the variant only ever arrives with the
 * received-taps list and the realtime tap events. This map is what the taps tab
 * and the socket learned, kept so a profile screen shows the cookie or the demon
 * rather than falling back to the fire, and so a tap that lands while a profile
 * is open announces itself without waiting for the profile to be re-fetched.
 */
const received = new SvelteMap<number, ReceivedTap>();

registerAccountCache({ reset: () => received.clear() });

/** Remember a batch of received taps, keeping the latest one per sender. */
export function recordReceivedTaps(
	taps: readonly (ReceivedTap & { profileId: number })[],
): void {
	for (const tap of taps) {
		const known = received.get(tap.profileId);
		if (known !== undefined && known.timestamp >= tap.timestamp) continue;
		received.set(tap.profileId, {
			timestamp: tap.timestamp,
			tapType: tap.tapType,
		});
	}
}

/**
 * The last tap this profile sent us that we know first-hand, or `null` — the
 * taps list may not have been loaded this session, and taps older than it are
 * only ever known from the profile's own `lastReceivedTapTimestamp`.
 */
export function receivedTap(profileId: number): ReceivedTap | null {
	return received.get(profileId) ?? null;
}

/**
 * Whether something that happened at `timestamp` is recent enough to announce,
 * given the current time. `null` covers a profile it never happened with.
 */
export function isRecentActivity(
	timestamp: number | null,
	now: number,
): boolean {
	if (timestamp === null) return false;
	// A clock that ran backwards, or a server timestamp ahead of ours: the age
	// would come out negative and pass the window check, and "in 3 hours" is
	// worse than saying nothing.
	return timestamp <= now && now - timestamp < RECENT_ACTIVITY_MAX_AGE_MS;
}

export type ProfileActivity =
	| { kind: "tap"; at: number; tapType: TapType }
	| { kind: "chat"; at: number };

/**
 * The recent things worth announcing on somebody's profile, newest first.
 *
 * Both can be true at once — they tapped, and one of us wrote — and the official
 * app lists both rather than picking, so this returns them in the order they
 * happened. A tap wins a tie: it is the one of the two that asks for an answer.
 */
export function profileActivity(
	{
		profileId,
		/** `lastReceivedTapTimestamp`: when they last tapped us. */
		tappedAt,
		/** `lastChatTimestamp`: the last message either of us sent. */
		chattedAt,
	}: { profileId: number; tappedAt: number | null; chattedAt: number | null },
	now: number,
): ProfileActivity[] {
	const known = received.get(profileId);
	// The profile was fetched once; a tap that landed since then is only in the
	// map, so the later of the two is the tap to announce.
	const tapAt =
		known !== undefined && known.timestamp > (tappedAt ?? 0)
			? known.timestamp
			: tappedAt;

	const activity: ProfileActivity[] = [];
	if (isRecentActivity(tapAt, now) && tapAt !== null) {
		// The variant is only ever known first-hand, and the list it comes from
		// may never have been loaded this session. The fire is what the official
		// app falls back to, and it is the tap our own send button defaults to,
		// so it is the likeliest guess.
		activity.push({
			kind: "tap",
			at: tapAt,
			tapType: known?.tapType ?? TapType.Hot,
		});
	}
	if (isRecentActivity(chattedAt, now) && chattedAt !== null) {
		activity.push({ kind: "chat", at: chattedAt });
	}
	return activity.sort((a, b) => b.at - a.at);
}
