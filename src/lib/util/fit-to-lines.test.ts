import { describe, expect, it } from "vitest";

import { widestLine } from "./fit-to-lines";

// A 20px line box, the shape Range.getClientRects() hands back per line.
function line(index: number, left: number, right: number, height = 20) {
	const top = index * 20;
	return { top, bottom: top + height, left, right };
}

describe("widestLine", () => {
	it("is 0 for a single line, which already hugs its text", () => {
		expect(widestLine([line(0, 0, 120)], 10)).toBe(0);
	});

	it("is 0 for no rects at all", () => {
		expect(widestLine([], 10)).toBe(0);
	});

	it("takes the widest of several lines", () => {
		expect(
			widestLine([line(0, 0, 260), line(1, 0, 90), line(2, 0, 140)], 10),
		).toBe(260);
	});

	it("merges the rects font fallback splits a line into", () => {
		// "text 🔥" — the emoji falls to another font and gets its own rect,
		// taller than the text's, so the line is measured end to end.
		const text = line(0, 0, 100);
		const emoji = { top: -2, bottom: 24, left: 100, right: 124 };
		expect(widestLine([text, emoji, line(1, 0, 40)], 10)).toBe(124);
	});

	it("keeps lines apart when a tall rect overlaps the next line", () => {
		const tall = { top: 0, bottom: 32, left: 0, right: 200 };
		expect(widestLine([tall, line(1, 0, 60)], 10)).toBe(200);
	});

	it("ignores empty rects, such as a trailing newline", () => {
		expect(widestLine([line(0, 0, 150), line(1, 0, 0)], 10)).toBe(0);
	});
});
