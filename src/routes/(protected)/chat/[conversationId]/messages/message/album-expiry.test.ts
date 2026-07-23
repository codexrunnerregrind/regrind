import { describe, expect, it } from "vitest";

import { albumExpiry } from "./album-expiry";

const NOW = 1_710_000_000_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe("albumExpiry", () => {
	it("returns null when nothing marks the album as expiring", () => {
		expect(
			albumExpiry({ viewableUntil: null, expirationType: null }, NOW),
		).toBe(null);
		expect(albumExpiry({}, NOW)).toBe(null);
	});

	it("returns null for indefinite shares", () => {
		expect(
			albumExpiry({ viewableUntil: null, expirationType: "INDEFINITE" }, NOW),
		).toBe(null);
	});

	it("ignores expiresAt entirely", () => {
		// expiresAt tracks the signed media URL and sits ~30 minutes out on every
		// album, so a 24 hour share counted down from it read "30 minutes left".
		expect(
			albumExpiry(
				{
					expiresAt: NOW + 30 * MINUTE,
					viewableUntil: NOW + 24 * HOUR,
					expirationType: "ONE_DAY",
				} as Parameters<typeof albumExpiry>[0],
				NOW,
			),
		).toEqual({ label: "1 day left", expired: false });
	});

	it("ignores a stamp on an album that does not declare an expiration", () => {
		expect(albumExpiry({ viewableUntil: NOW + 30 * MINUTE }, NOW)).toBe(null);
		expect(
			albumExpiry(
				{ viewableUntil: NOW + 30 * MINUTE, expirationType: "INDEFINITE" },
				NOW,
			),
		).toBe(null);
	});

	it("counts down a timed share using its stamp", () => {
		expect(
			albumExpiry(
				{ viewableUntil: NOW + 10 * MINUTE, expirationType: "ONE_DAY" },
				NOW,
			),
		).toEqual({ label: "10 minutes left", expired: false });
	});

	it("marks a timed share whose stamp has passed as expired", () => {
		expect(
			albumExpiry(
				{ viewableUntil: NOW - MINUTE, expirationType: "ONE_HOUR" },
				NOW,
			),
		).toEqual({ label: "Expired", expired: true });
	});

	it("treats the exact expiry moment as expired", () => {
		expect(
			albumExpiry({ viewableUntil: NOW, expirationType: "ONE_HOUR" }, NOW),
		).toEqual({ label: "Expired", expired: true });
	});

	it("falls back to the type when there is no stamp", () => {
		expect(albumExpiry({ expirationType: "ONCE" }, NOW)).toEqual({
			label: "View once",
			expired: false,
		});
		expect(albumExpiry({ expirationType: "ONE_DAY" }, NOW)).toEqual({
			label: "24 hours",
			expired: false,
		});
	});

	it("labels a view-once share rather than counting down its window", () => {
		expect(
			albumExpiry(
				{ viewableUntil: NOW + 30 * MINUTE, expirationType: "ONCE" },
				NOW,
			),
		).toEqual({ label: "View once", expired: false });
	});

	it("still expires a view-once share once its window has passed", () => {
		expect(
			albumExpiry({ viewableUntil: NOW - MINUTE, expirationType: "ONCE" }, NOW),
		).toEqual({ label: "Expired", expired: true });
	});

	it("degrades to no marker for an unrecognised type", () => {
		// Inbound expirationType is an unvalidated string by design, so a value
		// added server-side must not render a broken badge.
		expect(albumExpiry({ expirationType: "SOME_NEW_TYPE" }, NOW)).toBe(null);
		expect(
			albumExpiry(
				{ viewableUntil: NOW + MINUTE, expirationType: "SOME_NEW_TYPE" },
				NOW,
			),
		).toBe(null);
	});
});
