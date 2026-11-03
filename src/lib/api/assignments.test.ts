import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";

const { fetchRestMock } = vi.hoisted(() => ({ fetchRestMock: vi.fn() }));

vi.mock("$lib/api/transport", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/transport")>()),
	fetchRest: fetchRestMock,
}));

import { getAssignmentsV3 } from "$lib/api/assignments";

const MADRID = "ezjmgtwuz2n0";
const FLAG = {
	key: "camera-roll",
	value: "on",
	payload: {},
	type: "FEATURE_FLAG",
} as const;
const EXPERIMENT = {
	key: "feed-mix",
	value: "control",
	payload: { arm: 2 },
	type: "EXPERIMENT",
} as const;

function respondWith(assignments: unknown[]) {
	fetchRestMock.mockResolvedValue({
		jsonParsed: (schema: ZodType) => schema.parse({ assignments }),
	});
}

beforeEach(() => {
	fetchRestMock.mockReset();
});

describe("getAssignmentsV3", () => {
	it("asks for the geohash and returns the assignments", async () => {
		respondWith([FLAG, EXPERIMENT]);

		expect(await getAssignmentsV3({ geohash: MADRID })).toEqual({
			assignments: [FLAG, EXPERIMENT],
		});
		expect(fetchRestMock).toHaveBeenCalledExactlyOnceWith(
			`/v3/assignment?geohash=${MADRID}`,
		);
	});

	it("propagates a transport failure", async () => {
		fetchRestMock.mockRejectedValue(new Error("offline"));

		await expect(getAssignmentsV3({ geohash: MADRID })).rejects.toThrow(
			"offline",
		);
	});

	it("rejects an assignment the server made up", async () => {
		respondWith([{ key: "mystery", value: "on", payload: {}, type: "" }]);

		await expect(getAssignmentsV3({ geohash: MADRID })).rejects.toThrow();
	});
});
