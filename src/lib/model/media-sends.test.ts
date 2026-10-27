import { describe, expect, it } from "vitest";

import {
	arrangeMedia,
	decayedScore,
	forgetSends,
	rankBySends,
	recordSends,
} from "./media-sends";

const DAY = 24 * 60 * 60 * 1000;
const items = [1, 2, 3, 4, 5].map((id) => ({ id }));

describe("recordSends", () => {
	it("counts each id once per send", () => {
		const sends = recordSends({}, [1, 1, 2], 0);
		expect(sends[1]).toEqual({ score: 1, at: 0 });
		expect(sends[2]).toEqual({ score: 1, at: 0 });
	});

	it("halves old sends every 30 days", () => {
		const sends = recordSends(recordSends({}, [1], 0), [1], 30 * DAY);
		expect(sends[1]?.score).toBeCloseTo(1.5);
		expect(decayedScore(sends[1], 60 * DAY)).toBeCloseTo(0.75);
	});

	it("keeps the 200 highest scores", () => {
		let sends = recordSends(
			{},
			Array.from({ length: 200 }, (_, i) => i),
			0,
		);
		sends = recordSends(sends, [999], DAY);
		expect(Object.keys(sends)).toHaveLength(200);
		expect(sends[999]).toBeDefined();
	});
});

describe("forgetSends", () => {
	it("drops the given ids", () => {
		expect(forgetSends(recordSends({}, [1, 2], 0), [1])).toEqual({
			2: { score: 1, at: 0 },
		});
	});
});

describe("rankBySends", () => {
	it("leaves the order alone without sends", () => {
		expect(rankBySends(items, {}, 0)).toEqual(items);
	});

	it("puts every sent item first by score, the rest in order", () => {
		let sends = recordSends({}, [3, 5, 4], 0);
		sends = recordSends(sends, [3, 5], 0);
		sends = recordSends(sends, [5], 0);
		expect(rankBySends(items, sends, 0).map((i) => i.id)).toEqual([
			5, 3, 4, 1, 2,
		]);
	});

	it("ranks a single send above never sent", () => {
		const sends = recordSends({}, [4], 0);
		expect(rankBySends(items, sends, 0)[0]?.id).toBe(4);
	});

	it("lets recent sends overtake stale ones", () => {
		let sends = recordSends(recordSends({}, [4], 0), [4], 0);
		sends = recordSends(sends, [2], 90 * DAY);
		expect(rankBySends(items, sends, 90 * DAY).map((i) => i.id)).toEqual([
			2, 4, 1, 3, 5,
		]);
	});
});

describe("arrangeMedia", () => {
	const sends = recordSends(recordSends({}, [4], 0), [4], 0);
	const shuffled = [3, 1, 4, 2, 5].map((id) => ({ id }));
	const serverOrder = [1, 2, 3, 4, 5];

	it("restores the server order when not sorting", () => {
		expect(
			arrangeMedia(shuffled, {
				serverOrder,
				previous: null,
				sends: null,
				now: 0,
			}).map((i) => i.id),
		).toEqual([1, 2, 3, 4, 5]);
	});

	it("puts new items before the ranked ones", () => {
		expect(
			arrangeMedia(items, {
				serverOrder,
				previous: items.filter((i) => i.id !== 2),
				sends,
				now: 0,
			}).map((i) => i.id),
		).toEqual([2, 4, 1, 3, 5]);
	});
});
