import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAssignmentsV3Mock } = vi.hoisted(() => ({
	getAssignmentsV3Mock: vi.fn(),
}));

vi.mock("$lib/api/assignments", () => ({
	getAssignmentsV3: getAssignmentsV3Mock,
}));

import type { Assignment } from "$lib/model/assignments";
import { DefaultFilters, experimentsState } from "./experiments-state.svelte";

const MADRID = "ezjmgtwuz2n0";

function assignment(
	key: string,
	type: "FEATURE_FLAG" | "EXPERIMENT",
	value = "on",
): Assignment {
	return { key, value, payload: {}, type };
}

const ASSIGNMENTS: Assignment[] = [
	assignment("camera-roll", "FEATURE_FLAG"),
	assignment("feed-mix", "EXPERIMENT", "control"),
	assignment("photo-search", "EXPERIMENT"),
];

function keys(): string[] {
	return experimentsState.assignments.map(({ key }) => key);
}

async function waitForLoaded() {
	await vi.waitFor(() => expect(experimentsState.loading).toBe(false));
}

function load(assignments: Assignment[] = ASSIGNMENTS): Promise<void> {
	getAssignmentsV3Mock.mockResolvedValue({ assignments });
	experimentsState.load(MADRID);
	return waitForLoaded();
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

beforeEach(() => {
	getAssignmentsV3Mock.mockReset();
	experimentsState.assignments = [];
	experimentsState.filters = { ...DefaultFilters };
	experimentsState.error = null;
});

describe("load", () => {
	it("asks for the geohash and lists the assignments by key", async () => {
		await load([
			assignment("photo-search", "EXPERIMENT"),
			assignment("camera-roll", "FEATURE_FLAG"),
			assignment("feed-mix", "EXPERIMENT", "control"),
		]);

		expect(getAssignmentsV3Mock).toHaveBeenCalledExactlyOnceWith({
			geohash: MADRID,
		});
		expect(keys()).toEqual(["camera-roll", "feed-mix", "photo-search"]);
		expect(experimentsState.error).toBeNull();
	});

	it("does not fetch again while one is in flight", async () => {
		const gate = deferred<{ assignments: Assignment[] }>();
		getAssignmentsV3Mock.mockReturnValueOnce(gate.promise);

		experimentsState.load(MADRID);
		experimentsState.load(MADRID);

		expect(getAssignmentsV3Mock).toHaveBeenCalledTimes(1);
		gate.resolve({ assignments: ASSIGNMENTS });
		await waitForLoaded();

		expect(keys()).toEqual(["camera-roll", "feed-mix", "photo-search"]);
	});

	it("records a failed load and recovers on the next one", async () => {
		getAssignmentsV3Mock.mockRejectedValueOnce(new Error("offline"));

		experimentsState.load(MADRID);
		await waitForLoaded();

		expect(experimentsState.error?.message).toBe("offline");
		expect(keys()).toEqual([]);

		await load();

		expect(experimentsState.error).toBeNull();
		expect(keys()).toEqual(["camera-roll", "feed-mix", "photo-search"]);
	});

	it("keeps the previous list when a load fails", async () => {
		await load();
		getAssignmentsV3Mock.mockRejectedValueOnce(new Error("offline"));

		experimentsState.load(MADRID);
		await waitForLoaded();

		expect(experimentsState.error?.message).toBe("offline");
		expect(keys()).toEqual(["camera-roll", "feed-mix", "photo-search"]);
	});

	it("wraps a non-Error failure", async () => {
		getAssignmentsV3Mock.mockRejectedValueOnce("the tower fell");

		experimentsState.load(MADRID);
		await waitForLoaded();

		expect(experimentsState.error).toBeInstanceOf(Error);
		expect(experimentsState.error?.message).toBe(
			"Failed to fetch experiments",
		);
		expect(experimentsState.error?.cause).toBe("the tower fell");
	});
});

describe("filters", () => {
	beforeEach(async () => {
		await load();
	});

	it("shows everything with the default filters", () => {
		expect(keys()).toEqual(["camera-roll", "feed-mix", "photo-search"]);
	});

	it("shows only feature flags when flags is the only toggle", () => {
		experimentsState.setFilters({ flags: true });

		expect(keys()).toEqual(["camera-roll"]);
	});

	it("shows only experiments when experiments is the only toggle", () => {
		experimentsState.setFilters({ experiments: true });

		expect(keys()).toEqual(["feed-mix", "photo-search"]);
	});

	it("shows both kinds when both toggles are on", () => {
		experimentsState.setFilters({ flags: true, experiments: true });

		expect(keys()).toEqual(["camera-roll", "feed-mix", "photo-search"]);
	});

	it("matches the key as a substring", () => {
		experimentsState.setFilters({ key: "search" });

		expect(keys()).toEqual(["photo-search"]);
	});

	it("combines the type and key filters", () => {
		experimentsState.setFilters({ experiments: true, key: "feed" });

		expect(keys()).toEqual(["feed-mix"]);
	});

	it("keeps the other filters when one changes", () => {
		experimentsState.setFilters({ flags: true });
		experimentsState.setFilters({ key: "roll" });

		expect(keys()).toEqual(["camera-roll"]);
	});

	it("restores the full list when the filters are cleared", () => {
		experimentsState.setFilters({ flags: true, key: "photo" });
		expect(keys()).toEqual([]);

		experimentsState.setFilters(DefaultFilters);

		expect(keys()).toEqual(["camera-roll", "feed-mix", "photo-search"]);
	});

	it("re-applies the filters on the next load", async () => {
		experimentsState.setFilters({ flags: true });

		await load();

		expect(keys()).toEqual(["camera-roll"]);
	});
});
