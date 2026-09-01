import { describe, expect, it } from "vitest";

import { BAR_COUNT, peaksFromSamples } from "./audio-peaks";

const FLOOR = 0.08;

describe("peaksFromSamples", () => {
	it("draws one bar per slice of the clip", () => {
		const samples = new Float32Array(1000).fill(0.5);

		expect(peaksFromSamples(samples)).toHaveLength(BAR_COUNT);
		expect(peaksFromSamples(samples, 8)).toHaveLength(8);
	});

	it("scales the loudest moment to a full bar", () => {
		const samples = new Float32Array([0.1, 0.1, 0.2, 0.2]);

		expect(peaksFromSamples(samples, 2)).toEqual([0.5, 1]);
	});

	it("measures the loudest sample in a slice, not the average", () => {
		const samples = new Float32Array([0, 0, 0, 1]);

		expect(peaksFromSamples(samples, 2)).toEqual([FLOOR, 1]);
	});

	it("reads a negative swing as loudly as a positive one", () => {
		const samples = new Float32Array([-1, -1, 0.5, 0.5]);

		expect(peaksFromSamples(samples, 2)).toEqual([1, 0.5]);
	});

	it("leaves silence as a row of floor-height bars rather than nothing", () => {
		expect(peaksFromSamples(new Float32Array(64), 4)).toEqual([
			FLOOR,
			FLOOR,
			FLOOR,
			FLOOR,
		]);
		expect(peaksFromSamples(new Float32Array(), 3)).toEqual([
			FLOOR,
			FLOOR,
			FLOOR,
		]);
	});

	it("keeps a quiet slice visible at the floor", () => {
		const samples = new Float32Array([1, 1, 0.001, 0.001]);

		expect(peaksFromSamples(samples, 2)).toEqual([1, FLOOR]);
	});

	it("has nothing to draw when no bars are asked for", () => {
		expect(peaksFromSamples(new Float32Array([1]), 0)).toEqual([]);
	});
});
