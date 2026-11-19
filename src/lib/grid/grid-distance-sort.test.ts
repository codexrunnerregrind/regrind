import { describe, expect, it } from "vitest";

import type { GridProfile } from "./grid";
import { sortByDistance } from "./grid-distance-sort";
import { rendered } from "./grid-test-helpers";

function at(id: number, distance: number | null): GridProfile {
	return { ...rendered({ id }), distance };
}

function lazy(id: number): GridProfile {
	return { type: "lazy", id, unread: null, isVisiting: false };
}

function sort(
	profiles: GridProfile[],
	{
		seen = [],
		outOfOrder = [],
		shuffled = false,
	}: { seen?: number[]; outOfOrder?: number[]; shuffled?: boolean } = {},
) {
	const result = sortByDistance({
		profiles,
		seen,
		outOfOrder: new Set(outOfOrder),
		shuffled,
	});
	return { ids: result.map((p) => p.id) };
}

describe("sortByDistance", () => {
	it("sorts nearest first and keeps ties in server order", () => {
		expect(
			sort([at(1, 300), at(2, 100), at(3, 100), at(4, 50)]).ids,
		).toEqual([4, 2, 3, 1]);
	});

	it("places a hidden distance after the profile before it", () => {
		expect(
			sort([at(1, 100), at(2, null), at(3, 500), at(4, 200)]).ids,
		).toEqual([1, 2, 4, 3]);
	});

	it("places lazy profiles like hidden ones", () => {
		expect(sort([at(1, 100), lazy(2), at(3, 50)]).ids).toEqual([3, 1, 2]);
	});

	it("sinks hidden distances when the cascade was shuffled", () => {
		expect(
			sort([at(1, 100), at(2, null), at(3, 500)], { shuffled: true }).ids,
		).toEqual([1, 3, 2]);
	});

	it("does not anchor on injected profiles", () => {
		expect(
			sort([at(1, 100), at(9, 5000), at(2, null), at(3, 500)], {
				outOfOrder: [9],
			}).ids,
		).toEqual([1, 2, 3, 9]);
	});

	it("keeps the seen prefix", () => {
		expect(
			sort([at(1, 100), at(2, 200), at(3, 300), at(4, 50)], {
				seen: [1, 2, 3],
			}).ids,
		).toEqual([1, 2, 3, 4]);
	});

	it("skips seen ids that are gone", () => {
		expect(sort([at(2, 200), at(3, 100)], { seen: [1, 2] }).ids).toEqual([
			2, 3,
		]);
	});
});
