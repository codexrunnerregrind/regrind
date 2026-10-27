import { TapType } from "$lib/model/interest/taps";
import { HOUR, MINUTE, NOW } from "../config";
import { demoFavoriteOf } from "./favorites";
import { lastOnlineOf, onlineUntilOf, photosOf, profileSeed } from "./profiles";

const TAP_TYPE_PATTERN = [
	TapType.Hot,
	TapType.Hot,
	TapType.Looking,
	TapType.Friendly,
	TapType.Hot,
	TapType.Looking,
];
const tapSourceIds = [
	100001, 100006, 100009, 100013, 100250, 100777, 100042, 100123, 100333,
	100512, 100640, 100888, 100999, 101234,
];
const viewSourceIds = [
	100001, 100002, 100004, 100009, 100013, 100250, 100777, 100333, 100512,
	100640,
];
const secretAdmirerCount = 5;

export function demoReceivedTaps() {
	return tapSourceIds.map((id, i) => {
		const seed = profileSeed(id);
		const photos = photosOf(id);
		return {
			distance: seed.distanceM ?? null,
			profileImageMediaHash: photos[0] ?? null,
			isFavorite: demoFavoriteOf({ profileId: id, seed: seed.favorite }),
			profileId: id,
			displayName: seed.name,
			onlineUntil: onlineUntilOf(seed),
			timestamp: NOW - (i + 1) * 23 * MINUTE,
			tapType: TAP_TYPE_PATTERN[i % TAP_TYPE_PATTERN.length],
			lastOnline: lastOnlineOf(seed),
			isBoosting: false,
			isMutual: i % 4 === 0,
			rightNowType: "",
			isViewable: true,
		};
	});
}

// The last two are Best matches, so their tiles show the tap we sent.
const sentTapTargetIds = [
	100002, 100005, 100009, 100011, 100333, 100512, 100777, 101234, 100069,
	100137,
];

/**
 * The sent list as the API answers it: ids and timestamps only, with the
 * recipients left to `/v3/profiles`.
 */
export function demoSentTaps(ourProfileId: number) {
	return sentTapTargetIds.map((id, i) => ({
		senderId: ourProfileId,
		receiverId: id,
		tapType: TAP_TYPE_PATTERN[i % TAP_TYPE_PATTERN.length],
		sentOn: NOW - (i + 1) * 37 * MINUTE,
		readOn: i % 3 === 0 ? NOW - (i + 1) * 30 * MINUTE : null,
		// One taken back, so the list has something to filter.
		deleted: i === 4,
	}));
}

export function demoViews() {
	const profiles = viewSourceIds.map((id, i) => {
		const seed = profileSeed(id);
		const photos = photosOf(id);
		return {
			profileImageMediaHash: photos[0] ?? null,
			distance: seed.distanceM ?? null,
			isFavorite: demoFavoriteOf({ profileId: id, seed: seed.favorite }),
			lastViewed: NOW - (i + 1) * 41 * MINUTE,
			isSecretAdmirer: false,
			viewedCount: { totalCount: 1 + (i % 4), maxDisplayCount: 99 },
			profileId: id,
			displayName: seed.name,
			onlineUntil: onlineUntilOf(seed),
		};
	});
	const previews = Array.from({ length: secretAdmirerCount }, (_, i) => ({
		profileImageMediaHash: null,
		distance: null,
		isFavorite: false,
		lastViewed: NOW - (i + 1) * 2 * HOUR,
		isSecretAdmirer: true,
		viewedCount: { totalCount: 1, maxDisplayCount: 99 },
	}));
	return { profiles, previews };
}

const MATCH_SOURCE_PATTERN = [
	"MUTUAL_TAP",
	"VIEW_YOUR_TYPE",
	"TAP_YOUR_TYPE",
	"MUTUAL_VIEWS",
	"VIEW_YOUR_TYPE",
];
// Past one page, so the list has a second page to load.
const matchCount = 42;

/** `/v1/matches`, paged by an opaque cursor that is just the next offset. */
export function demoMatches(params: URLSearchParams) {
	const limit = Number(params.get("limit") ?? 30) || 30;
	const offset = Number(params.get("cursor") ?? 0) || 0;
	const matches = Array.from(
		{ length: Math.max(0, Math.min(limit, matchCount - offset)) },
		(_, k) => {
			const i = offset + k;
			const id = 100001 + i * 17;
			const seed = profileSeed(id);
			return {
				matchId: `demo-match-${id}`,
				source: MATCH_SOURCE_PATTERN[i % MATCH_SOURCE_PATTERN.length],
				lastInteraction: NOW - (i + 1) * 53 * MINUTE,
				isViewable: i % 3 !== 0,
				profile: {
					profileId: id,
					displayName: seed.name,
					profileImageMediaHash: photosOf(id)[0] ?? null,
					onlineUntil: onlineUntilOf(seed),
					position: seed.position,
					height: seed.heightCm,
					weight: seed.weightG,
					distance: seed.distanceM,
					age: seed.showAge ? seed.age : null,
					visitingStatus: i % 7 === 0 ? true : null,
					tapped: sentTapTargetIds.includes(id) ? true : null,
					isOnPrep: false,
				},
			};
		},
	);
	const next = offset + matches.length;
	return {
		matches,
		nextCursor: next < matchCount ? String(next) : null,
		total: matchCount,
	};
}
