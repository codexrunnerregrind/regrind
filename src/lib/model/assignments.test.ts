import { describe, expect, it } from "vitest";

import {
	assignmentSchema,
	assignmentsV3QuerySchema,
	assignmentsV3ResponseSchema,
} from "$lib/model/assignments";

describe("assignmentsV3QuerySchema", () => {
	it("requires a twelve-character geohash", () => {
		expect(
			assignmentsV3QuerySchema.safeParse({ geohash: "ezjmgtwuz2n0" })
				.success,
		).toBe(true);
		expect(assignmentsV3QuerySchema.safeParse({}).success).toBe(false);
		expect(
			assignmentsV3QuerySchema.safeParse({ geohash: "ezjmgtwuz2n" })
				.success,
		).toBe(false);
	});
});

describe("assignmentSchema", () => {
	it("accepts feature flags and experiments", () => {
		expect(
			assignmentSchema.parse({
				key: "camera-roll",
				value: "on",
				payload: {},
				type: "FEATURE_FLAG",
			}),
		).toEqual({
			key: "camera-roll",
			value: "on",
			payload: {},
			type: "FEATURE_FLAG",
		});
		expect(
			assignmentSchema.parse({
				key: "feed-mix",
				value: "control",
				payload: { arm: 2 },
				type: "EXPERIMENT",
			}),
		).toEqual({
			key: "feed-mix",
			value: "control",
			payload: { arm: 2 },
			type: "EXPERIMENT",
		});
	});

	it("leaves the payload untouched", () => {
		const payload = { arm: 2, note: null, nested: { on: false } };
		expect(
			assignmentSchema.parse({
				key: "feed-mix",
				value: "control",
				payload,
				type: "EXPERIMENT",
			}).payload,
		).toBe(payload);
	});

	it("rejects an unknown type", () => {
		expect(
			assignmentSchema.safeParse({
				key: "camera-roll",
				value: "on",
				payload: {},
				type: "MYSTERY",
			}).success,
		).toBe(false);
	});
});

describe("assignmentsV3ResponseSchema", () => {
	it("parses the list of assignments", () => {
		expect(
			assignmentsV3ResponseSchema.parse({
				assignments: [
					{
						key: "camera-roll",
						value: "on",
						payload: {},
						type: "FEATURE_FLAG",
					},
				],
			}),
		).toEqual({
			assignments: [
				{
					key: "camera-roll",
					value: "on",
					payload: {},
					type: "FEATURE_FLAG",
				},
			],
		});
	});

	it("accepts an empty list and rejects a missing one", () => {
		expect(assignmentsV3ResponseSchema.parse({ assignments: [] })).toEqual({
			assignments: [],
		});
		expect(assignmentsV3ResponseSchema.safeParse({}).success).toBe(false);
	});
});
