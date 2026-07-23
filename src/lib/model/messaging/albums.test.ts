import { describe, expect, it } from "vitest";

import {
	ALBUM_NAME_MAX_BYTES,
	albumNameByteLength,
} from "$lib/model/messaging/albums";

describe("albumNameByteLength", () => {
	it("counts ASCII as one byte each", () => {
		expect(albumNameByteLength("Gym")).toBe(3);
	});

	it("counts multi-byte characters by their UTF-8 length", () => {
		// Four bytes, one code point — the case that makes a character-based
		// limit disagree with the API's byte-based one.
		expect(albumNameByteLength("🍑")).toBe(4);
		expect(albumNameByteLength("é")).toBe(2);
	});

	it("puts a name of emoji over the limit while under it by characters", () => {
		const name = "🍑".repeat(64);

		expect(name.length).toBeLessThan(ALBUM_NAME_MAX_BYTES);
		expect(albumNameByteLength(name)).toBeGreaterThan(ALBUM_NAME_MAX_BYTES);
		expect(albumNameByteLength("a".repeat(ALBUM_NAME_MAX_BYTES))).toBe(
			ALBUM_NAME_MAX_BYTES,
		);
	});
});
