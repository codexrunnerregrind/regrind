import { afterEach, describe, expect, it } from "vitest";

import {
	clearAlbumShareState,
	getAlbumShared,
	markSharesSwept,
	setAlbumShared,
	sharesSweptRecently,
} from "$lib/api/messaging/album-shares-state.svelte";
import { resetNowForTesting, setNowForTesting } from "$lib/util/clock";

afterEach(() => {
	clearAlbumShareState();
	resetNowForTesting();
});

describe("album share state", () => {
	it("reports unknown for an album it has never seen", () => {
		expect(getAlbumShared(1, 42)).toBeUndefined();
	});

	it("distinguishes unknown from known-unshared", () => {
		setAlbumShared(1, 42, false);

		expect(getAlbumShared(1, 42)).toBe(false);
		expect(getAlbumShared(2, 42)).toBeUndefined();
	});

	it("keys on the profile as well as the album", () => {
		setAlbumShared(1, 42, true);

		expect(getAlbumShared(1, 42)).toBe(true);
		expect(getAlbumShared(1, 43)).toBeUndefined();
	});
});

describe("sweep TTL", () => {
	it("is not recent before a sweep is recorded", () => {
		expect(sharesSweptRecently(42)).toBe(false);
	});

	it("stays recent within the TTL and lapses after it", () => {
		let clock = 1_000;
		setNowForTesting(() => clock);

		markSharesSwept(42);
		expect(sharesSweptRecently(42)).toBe(true);

		clock += 59_999;
		expect(sharesSweptRecently(42)).toBe(true);

		clock += 1;
		expect(sharesSweptRecently(42)).toBe(false);
	});

	it("tracks profiles separately", () => {
		setNowForTesting(() => 1_000);
		markSharesSwept(42);

		expect(sharesSweptRecently(42)).toBe(true);
		expect(sharesSweptRecently(43)).toBe(false);
	});
});
