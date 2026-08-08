import { beforeEach, describe, expect, it } from "vitest";

import { clearAccountCaches } from "$lib/api/account-caches";
import { TapType } from "$lib/model/interest/taps";
import {
	isRecentActivity,
	profileActivity,
	receivedTap,
	RECENT_ACTIVITY_MAX_AGE_MS,
	recordReceivedTaps,
} from "./profile-activity.svelte";

const NOW = 1_700_000_000_000;

beforeEach(() => {
	clearAccountCaches();
});

describe("recordReceivedTaps", () => {
	it("remembers the tap a profile sent", () => {
		recordReceivedTaps([
			{ profileId: 7, timestamp: NOW, tapType: TapType.Looking },
		]);

		expect(receivedTap(7)).toEqual({
			timestamp: NOW,
			tapType: TapType.Looking,
		});
	});

	it("answers with null for a profile that never tapped", () => {
		expect(receivedTap(7)).toBeNull();
	});

	it("keeps the newest tap when an older one is recorded after it", () => {
		recordReceivedTaps([
			{ profileId: 7, timestamp: NOW, tapType: TapType.Hot },
		]);
		recordReceivedTaps([
			{ profileId: 7, timestamp: NOW - 1000, tapType: TapType.Friendly },
		]);

		expect(receivedTap(7)?.tapType).toBe(TapType.Hot);
	});

	it("takes a newer tap over the one held", () => {
		recordReceivedTaps([
			{ profileId: 7, timestamp: NOW - 1000, tapType: TapType.Hot },
		]);
		recordReceivedTaps([
			{ profileId: 7, timestamp: NOW, tapType: TapType.Friendly },
		]);

		expect(receivedTap(7)?.tapType).toBe(TapType.Friendly);
	});

	it("keeps a tap with no variant recorded", () => {
		recordReceivedTaps([{ profileId: 7, timestamp: NOW, tapType: null }]);

		expect(receivedTap(7)).toEqual({ timestamp: NOW, tapType: null });
	});

	it("forgets everything when the account changes", () => {
		recordReceivedTaps([
			{ profileId: 7, timestamp: NOW, tapType: TapType.Hot },
		]);

		clearAccountCaches();

		expect(receivedTap(7)).toBeNull();
	});
});

describe("isRecentActivity", () => {
	it("rejects something that never happened", () => {
		expect(isRecentActivity(null, NOW)).toBe(false);
	});

	it("accepts a tap from just now", () => {
		expect(isRecentActivity(NOW, NOW)).toBe(true);
	});

	it("accepts something inside the window", () => {
		expect(
			isRecentActivity(NOW - RECENT_ACTIVITY_MAX_AGE_MS + 1000, NOW),
		).toBe(true);
	});

	it("rejects something at the edge of the window", () => {
		expect(isRecentActivity(NOW - RECENT_ACTIVITY_MAX_AGE_MS, NOW)).toBe(
			false,
		);
	});

	it("rejects a timestamp in the future", () => {
		expect(isRecentActivity(NOW + 1000, NOW)).toBe(false);
	});
});

describe("profileActivity", () => {
	const HOUR = 60 * 60 * 1000;

	function activity(
		tappedAt: number | null,
		chattedAt: number | null,
	): ReturnType<typeof profileActivity> {
		return profileActivity({ profileId: 7, tappedAt, chattedAt }, NOW);
	}

	function kinds(tappedAt: number | null, chattedAt: number | null) {
		return activity(tappedAt, chattedAt).map((entry) => entry.kind);
	}

	it("announces nothing when neither happened", () => {
		expect(activity(null, null)).toEqual([]);
	});

	it("announces a recent tap", () => {
		expect(activity(NOW - HOUR, null)).toEqual([
			{ kind: "tap", at: NOW - HOUR, tapType: TapType.Hot },
		]);
	});

	it("announces a recent chat", () => {
		expect(activity(null, NOW - HOUR)).toEqual([
			{ kind: "chat", at: NOW - HOUR },
		]);
	});

	it("takes the tap variant from the taps we know first-hand", () => {
		recordReceivedTaps([
			{ profileId: 7, timestamp: NOW - HOUR, tapType: TapType.Friendly },
		]);

		expect(activity(NOW - HOUR, null)[0]).toMatchObject({
			tapType: TapType.Friendly,
		});
	});

	// The profile was fetched once. A tap that landed over the socket since then
	// is only in the map, and it is the one to announce.
	it("prefers a tap learned since the profile was fetched", () => {
		recordReceivedTaps([
			{ profileId: 7, timestamp: NOW, tapType: TapType.Looking },
		]);

		expect(activity(NOW - 3 * HOUR, null)).toEqual([
			{ kind: "tap", at: NOW, tapType: TapType.Looking },
		]);
	});

	it("falls back to the fire when the variant was never learned", () => {
		expect(activity(NOW - HOUR, null)[0]).toMatchObject({
			tapType: TapType.Hot,
		});
	});

	it("announces both, newest first, when the tap is newer", () => {
		expect(kinds(NOW - HOUR, NOW - 3 * HOUR)).toEqual(["tap", "chat"]);
	});

	it("announces both, newest first, when the chat is newer", () => {
		expect(kinds(NOW - 3 * HOUR, NOW - HOUR)).toEqual(["chat", "tap"]);
	});

	it("puts the tap first when the two land on the same moment", () => {
		expect(kinds(NOW - HOUR, NOW - HOUR)).toEqual(["tap", "chat"]);
	});

	it("drops a stale tap and keeps a recent chat", () => {
		const stale = NOW - RECENT_ACTIVITY_MAX_AGE_MS - HOUR;

		expect(activity(stale, NOW - HOUR)).toEqual([
			{ kind: "chat", at: NOW - HOUR },
		]);
	});

	it("announces nothing when both are stale", () => {
		const stale = NOW - RECENT_ACTIVITY_MAX_AGE_MS - HOUR;

		expect(activity(stale, stale)).toEqual([]);
	});
});
