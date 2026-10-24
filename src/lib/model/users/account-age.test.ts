import { describe, expect, it } from "vitest";

import { estimateAccountCreation } from "./account-age";

const day = (date: Date) => date.toISOString().slice(0, 10);

describe("estimateAccountCreation", () => {
	it("returns the anchor date for an anchor id", () => {
		expect(day(estimateAccountCreation(351220000))).toBe("2021-04-16");
	});

	it("interpolates between anchors", () => {
		const date = estimateAccountCreation(600000000);
		expect(date > new Date("2023-04-02")).toBe(true);
		expect(date < new Date("2024-06-01")).toBe(true);
	});

	it("clamps ids below the first anchor", () => {
		expect(day(estimateAccountCreation(-5))).toBe("2009-04-01");
	});

	it("extrapolates past the last anchor, capped at now", () => {
		const now = Date.parse("2027-01-01T00:00:00Z");
		const date = estimateAccountCreation(950000000, now);
		expect(date > new Date("2026-10-24")).toBe(true);
		expect(date.getTime()).toBeLessThanOrEqual(now);
		expect(estimateAccountCreation(5_000_000_000, now).getTime()).toBe(now);
	});
});
