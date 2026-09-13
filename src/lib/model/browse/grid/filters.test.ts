import { describe, expect, it } from "vitest";

import {
	defaultFilters,
	FilterAcceptNSFWPics,
	filterAcceptNSFWPicsSchema,
	filterAgeSchema,
	FilterBodyType,
	filterGendersSchema,
	filterHeightSchema,
	FilterLookingFor,
	FilterPosition,
	filterPositionSchema,
	filterWeightSchema,
	GENDER_ASK_ME,
	gridSearchFiltersSchema,
	isFilterableGender,
	isFilterableTagKey,
	tagCatalog,
	usernameMatches,
} from "$lib/model/browse/grid/filters";

describe("grid search filter schemas", () => {
	it("accepts the default filter state", () => {
		expect(gridSearchFiltersSchema.parse(defaultFilters)).toEqual(
			defaultFilters,
		);
	});

	it("clamps saved ranges into the official app's limits", () => {
		expect(filterAgeSchema.parse([17, 102])).toEqual([18, 99]);
		expect(filterHeightSchema.parse([120, 242])).toEqual([121, 241]);
		expect(filterWeightSchema.parse([40, 273])).toEqual([41, 272]);
		expect(filterAgeSchema.safeParse([18]).success).toBe(false);
	});

	it("keeps old saved preferences parsable", () => {
		expect(
			gridSearchFiltersSchema.parse({
				ageEnabled: true,
				age: [30, 102],
				weight: [40, 273],
			}),
		).toMatchObject({ age: [30, 99], weight: [41, 272] });
	});

	it("accepts not-specified aliases for filters that expose them", () => {
		expect(
			filterPositionSchema.parse([FilterPosition.NotSpecified]),
		).toEqual([FilterPosition.NotSpecified]);
		expect(FilterBodyType.NotSpecified).toBe(-1);
		expect(FilterLookingFor.NotSpecified).toBe(-1);
		expect(FilterAcceptNSFWPics.NotSpecified).toBe(-1);
		expect(
			filterAcceptNSFWPicsSchema.parse([
				FilterAcceptNSFWPics.NotSpecified,
			]),
		).toEqual([FilterAcceptNSFWPics.NotSpecified]);
	});

	it("accepts not-specified (-1) alongside gender ids", () => {
		expect(filterGendersSchema.parse([-1, 42])).toEqual([-1, 42]);
		expect(filterGendersSchema.safeParse([-2]).success).toBe(false);
	});
});

describe("usernameMatches", () => {
	it("matches any profile while the query is blank", () => {
		expect(usernameMatches("Alex", "")).toBe(true);
		expect(usernameMatches(null, "   ")).toBe(true);
	});

	it("matches part of a display name, ignoring case", () => {
		expect(usernameMatches("Alex", "ale")).toBe(true);
		expect(usernameMatches("alex", "LE")).toBe(true);
		expect(usernameMatches("Alex", " alex ")).toBe(true);
		expect(usernameMatches("Alex", "sam")).toBe(false);
	});

	it("never matches a profile without a display name", () => {
		expect(usernameMatches(null, "alex")).toBe(false);
		expect(usernameMatches(undefined, "alex")).toBe(false);
	});
});

describe("filterable values", () => {
	const gender = {
		genderId: 1,
		gender: "Man",
		displayGroup: 1,
		sortFilter: 1,
	};

	it("offers only genders the official filter sheet lists", () => {
		expect(isFilterableGender(gender)).toBe(true);
		expect(isFilterableGender({ ...gender, sortFilter: null })).toBe(false);
		expect(isFilterableGender({ ...gender, genderId: GENDER_ASK_ME })).toBe(
			false,
		);
	});

	it("hides the tags that moved to genders", () => {
		expect(isFilterableTagKey("ftm")).toBe(false);
		expect(isFilterableTagKey("mtf")).toBe(false);
		expect(isFilterableTagKey("coffee")).toBe(true);
	});
});

const languages = [
	{
		language: "en",
		categoryCollection: [
			{
				text: "Interests",
				possessiveText: null,
				tags: [
					{ tagId: 1, key: "hiking", text: "Hiking" },
					{ tagId: 2, key: "gaming", text: "Gaming" },
					{ tagId: 3, key: "ftm", text: "FTM" },
				],
			},
		],
	},
	{
		language: "de",
		categoryCollection: [
			{
				text: "Interessen",
				possessiveText: null,
				tags: [{ tagId: 11, key: "hiking", text: "Wandern" }],
			},
		],
	},
];

describe("tagCatalog", () => {
	it("lists each key once with the first language's text", () => {
		const catalog = tagCatalog(languages);

		expect(catalog.flat.map(({ key, text }) => [key, text])).toEqual([
			["gaming", "Gaming"],
			["hiking", "Hiking"],
		]);
		expect(catalog.textOf("hiking")).toBe("Hiking");
	});

	it("leaves the tags that moved to genders out of the lists", () => {
		const catalog = tagCatalog(languages);

		expect(catalog.categories[0]?.tags.map(({ key }) => key)).toEqual([
			"hiking",
			"gaming",
		]);
		expect(catalog.keysOf(["FTM"])).toEqual(["ftm"]);
	});

	it("finds a key by its text in any language", () => {
		const catalog = tagCatalog(languages);

		expect(
			catalog.flat.find(({ key }) => key === "hiking")?.textsLower,
		).toEqual(["hiking", "wandern"]);
		expect(
			catalog.keysOf(["Wandern", "hiking", "gaming", "unknown"]),
		).toEqual(["hiking", "gaming", "unknown"]);
	});
});
