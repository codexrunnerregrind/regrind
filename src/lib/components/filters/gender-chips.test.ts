import { describe, expect, it } from "vitest";

import { isGenderChipShown, selectGenders } from "./gender-chips";

const men = { genderId: 1, displayGroup: 1, excludeOnFilterSelection: [5] };
const women = { genderId: 2, displayGroup: 1, excludeOnFilterSelection: [] };
const cisMen = { genderId: 5, displayGroup: 2, excludeOnFilterSelection: [] };
const nonBinary = {
	genderId: 3,
	displayGroup: 2,
	excludeOnFilterSelection: null,
};
const genders = [men, women, cisMen, nonBinary];

describe("isGenderChipShown", () => {
	it("shows only the first display group while collapsed", () => {
		const shown = genders.filter((gender) =>
			isGenderChipShown({ gender, selected: [], expanded: false }),
		);

		expect(shown).toEqual([men, women]);
	});

	it("shows every group once expanded", () => {
		const shown = genders.filter((gender) =>
			isGenderChipShown({ gender, selected: [], expanded: true }),
		);

		expect(shown).toEqual(genders);
	});

	it("hides a chip excluded by the selection", () => {
		expect(
			isGenderChipShown({ gender: men, selected: [5], expanded: true }),
		).toBe(false);
	});

	it("keeps a selected chip visible while collapsed", () => {
		expect(
			isGenderChipShown({
				gender: nonBinary,
				selected: [3],
				expanded: false,
			}),
		).toBe(true);
	});

	it("keeps a selected chip visible when the selection excludes it", () => {
		for (const expanded of [false, true]) {
			expect(
				isGenderChipShown({ gender: men, selected: [1, 5], expanded }),
			).toBe(true);
		}
	});
});

describe("selectGenders", () => {
	it("unselects a chip that the new pick excludes", () => {
		expect(
			selectGenders({ genders, previous: [1, 2], next: [1, 2, 5] }),
		).toEqual([2, 5]);
	});

	it("passes an unselect through unchanged", () => {
		expect(selectGenders({ genders, previous: [1, 2], next: [2] })).toEqual(
			[2],
		);
	});

	it("keeps ids missing from the catalog", () => {
		expect(
			selectGenders({ genders, previous: [-1, 42], next: [-1, 42, 2] }),
		).toEqual([-1, 42, 2]);
	});
});
