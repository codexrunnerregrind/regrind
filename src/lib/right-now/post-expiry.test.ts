import { describe, expect, it } from "vitest";

import { postExpired, postTimeLeft } from "./post-expiry";

const NOW = 1_780_000_000_000;

describe("post time left", () => {
	it("counts down from a millisecond stamp", () => {
		expect(
			postTimeLeft({ expiration: NOW + 42 * 60_000, nowMs: NOW }),
		).toBe("42 min left");
	});

	it("rounds a part-minute up rather than showing zero", () => {
		expect(postTimeLeft({ expiration: NOW + 30_000, nowMs: NOW })).toBe(
			"1 min left",
		);
	});

	it("reads a seconds stamp as seconds", () => {
		// Read as milliseconds this would land in 1970 and report "Expired".
		expect(
			postTimeLeft({
				expiration: Math.floor((NOW + 60 * 60_000) / 1000),
				nowMs: NOW,
			}),
		).toBe("1 hr left");
	});

	it("says so once the post is past its deadline", () => {
		expect(postTimeLeft({ expiration: NOW - 1, nowMs: NOW })).toBe(
			"Expired",
		);
	});

	it("has nothing to say without a stamp", () => {
		expect(postTimeLeft({ expiration: null, nowMs: NOW })).toBeNull();
		expect(postTimeLeft({ expiration: undefined, nowMs: NOW })).toBeNull();
	});
});

describe("post expired", () => {
	it("is over once the deadline has passed", () => {
		expect(postExpired({ expiration: NOW - 1, nowMs: NOW })).toBe(true);
		expect(postExpired({ expiration: NOW, nowMs: NOW })).toBe(true);
	});

	it("is not over while there is time on it", () => {
		expect(postExpired({ expiration: NOW + 60_000, nowMs: NOW })).toBe(
			false,
		);
	});

	it("reads a seconds stamp as seconds", () => {
		// Read as milliseconds this would land in 1970 and call a live post over.
		expect(
			postExpired({
				expiration: Math.floor(NOW / 1000) + 60,
				nowMs: NOW,
			}),
		).toBe(false);
	});

	it("cannot call an hour it was never told about over", () => {
		expect(postExpired({ expiration: null, nowMs: NOW })).toBe(false);
		expect(postExpired({ expiration: undefined, nowMs: NOW })).toBe(false);
	});
});
