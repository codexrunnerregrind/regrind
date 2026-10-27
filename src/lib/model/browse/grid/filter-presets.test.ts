import { describe, expect, it } from "vitest";

import { derivePresetName } from "./filter-presets";
import { defaultFilters } from "./filters";

describe("derivePresetName", () => {
	it("names an empty filter set", () => {
		expect(derivePresetName({ filters: defaultFilters, taken: [] })).toBe(
			"All profiles",
		);
	});

	it("lists toggles and age, then counts the rest", () => {
		const filters = {
			...defaultFilters,
			isOnline: true,
			ageEnabled: true,
			age: [20, 30],
			tribesEnabled: true,
			heightEnabled: true,
		};
		expect(derivePresetName({ filters, taken: [] })).toBe(
			"Online · 20 - 30 · +2",
		);
	});

	it("numbers a name that is taken", () => {
		expect(
			derivePresetName({
				filters: defaultFilters,
				taken: ["All profiles", "All profiles 2"],
			}),
		).toBe("All profiles 3");
	});
});
