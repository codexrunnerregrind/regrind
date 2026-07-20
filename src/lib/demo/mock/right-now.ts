import { NOW } from "../config";
import type {
	RightNowFeedResponse,
	RightNowPostMediaItem,
	RightNowV3Post,
	LockedPostV1,
} from "$lib/model/right-now/feed/response/v4";
import {
	photosOf,
	distanceForId,
	onlineUntilOf,
	profileSeed,
} from "./profiles";

const NUMBER_OF_POSTS = 20;
const STARTING_PROFILE_ID = 100001;

const ONE_HOUR_MS = 60 * 60 * 1000;

const FULL_IMAGE_DIMENSIONS = [
	"1024/768",
	"768/1024",
	"800/800",
	"450/1024",
	"1024/450",
	"960/1400",
	"1400/960",
] as const;

const WORDS = [
	"lorem",
	"ipsum",
	"dolor",
	"sit",
	"amet",
	"consectetur",
	"adipiscing",
	"elit",
	"sed",
	"🤗️🤯️",
	"😱️",
] as const;

function hosting(profileId: number) {
	return profileId % 4 === 0;
}

function mpuScoreOf(profileId: number): number {
	const MOD = 100_000;
	const x = ((Math.floor(profileId) % MOD) + MOD) % MOD;
	const raw = 10 + (x / MOD) * 30;
	return Math.round(raw * 100) / 100;
}

function postedOf(profileId: number): number {
	const MOD = 10;
	const x = ((Math.floor(profileId) % MOD) + MOD) % MOD;
	const delayMs = Math.floor((x / MOD) * ONE_HOUR_MS);
	return NOW - delayMs;
}

function distanceOf(profileId: number) {
	return profileId % 3 === 0 ? undefined : distanceForId(profileId);
}

function typeOf(profileId: number) {
	return profileId % 2 === 0
		? {
				type: "right_now_post_v3",
				dataType: "RightNowFeedItemData$RightNowPostV3",
			}
		: {
				type: "locked_post_v1",
				dataType: "RightNowFeedItemData$LockedPostV1",
			};
}

function imageUrlsOf(mediaId: number) {
	const fullDimensions =
		FULL_IMAGE_DIMENSIONS[mediaId % FULL_IMAGE_DIMENSIONS.length];

	return {
		thumbnailUrl: `https://picsum.photos/seed/${mediaId}/480/480.jpg`,
		fullImageUrl: `https://picsum.photos/seed/${mediaId}/${fullDimensions}.jpg`,
	};
}

function imediaOf(profileId: number): RightNowPostMediaItem[] {
	if (profileId % 3 !== 0) {
		return [];
	}

	const mediaId = profileId * 2;
	const { thumbnailUrl, fullImageUrl } = imageUrlsOf(mediaId);

	return [
		{
			type: "image_v1",
			data: {
				mediaId: profileId,
				thumbnailUrl,
				fullImageUrl,
				contentType: "image/jpeg",
				state: "APPROVED",
				reason: null,
				isRejectAutomated: null,
				shouldBlur: false,
				isNsfw: false,
				source: "RIGHT_NOW",
			},
		},
	];
}

export function textOf(profileId: number): string | undefined {
	if ((profileId + 1) % 2 !== 0) {
		return;
	}

	const MAX_WORDS = 40;
	const MIN_WORDS = 2;
	const count = (profileId % (MAX_WORDS - MIN_WORDS + 1)) + MIN_WORDS;

	let x = profileId;
	const rand = () => {
		x = (x * 1103515245 + 12345) % 2 ** 31;
		return x / 2 ** 31;
	};

	const out: string[] = [];
	for (let i = 0; i < count; i++) {
		out.push(WORDS[Math.floor(rand() * WORDS.length)]);
	}
	return out.join(" ");
}

function createPost(profileId: number) {
	const seed = profileSeed(profileId);
	const { type, dataType } = typeOf(profileId);

	return {
		type: type,
		data: {
			"@type": dataType,
			id: profileId * 2,
			profileId: profileId,
			mediaHash: photosOf(profileId)[0],
			displayName: seed.name ?? undefined,
			distance: distanceOf(profileId),
			media: imediaOf(profileId),
			text: textOf(profileId),
			hosting: hosting(profileId),
			posted: postedOf(profileId),
			expiration: postedOf(profileId) + ONE_HOUR_MS,
			onlineUntil: onlineUntilOf(seed) ?? undefined,
			mpuScore: mpuScoreOf(profileId),
			recentlyChatted: false,
			favorite: seed.favorite,
		},
	} as RightNowV3Post | LockedPostV1;
}

const posts = Array.from({ length: NUMBER_OF_POSTS }, (_, i) =>
	createPost(STARTING_PROFILE_ID + i),
);

function filterPosts(params: URLSearchParams) {
	const distance = params.get("order") === "DISTANCE";
	const hosting = params.get("hosting");
	const ageMinParam = params.get("ageMin");
	const ageMaxParam = params.get("ageMax");
	const ageMin = ageMinParam ? parseInt(ageMinParam, 10) : null;
	const ageMax = ageMaxParam ? parseInt(ageMaxParam, 10) : null;
	const positionParams = params.get("sexualPositions");
	const positions = positionParams
		? positionParams.split(",").map(Number)
		: null;

	return posts
		.filter((post) => {
			const seed = profileSeed(post.data.profileId);
			if (hosting === "true" && !post.data.hosting) return false;
			if (hosting === "false" && post.data.hosting) return false;
			if (ageMin !== null && (seed.age === null || seed.age < ageMin))
				return false;
			if (ageMax !== null && (seed.age === null || seed.age > ageMax))
				return false;
			if (
				positions !== null &&
				(seed.position === null || !positions.includes(seed.position))
			)
				return false;
			return true;
		})
		.toSorted((a, b) => (distance ? 0 : b.data?.posted - a.data?.posted));
}

export function demoRightNowFeed(
	params: URLSearchParams,
): RightNowFeedResponse {
	return {
		items: filterPosts(params),
		viewerCount: 0,
	};
}
