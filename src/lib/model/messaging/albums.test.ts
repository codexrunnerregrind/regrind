import { describe, expect, it } from "vitest";

import {
	ALBUM_NAME_MAX_BYTES,
	albumNameByteLength,
	albumNameSchema,
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
});

describe("albumNameSchema", () => {
	it("accepts null and empty names", () => {
		expect(albumNameSchema.safeParse(null).success).toBe(true);
		expect(albumNameSchema.safeParse("").success).toBe(true);
	});

	it("accepts a name exactly at the byte limit", () => {
		const name = "a".repeat(ALBUM_NAME_MAX_BYTES);
		expect(albumNameSchema.safeParse(name).success).toBe(true);
	});

	it("rejects a name one byte over the limit", () => {
		const name = "a".repeat(ALBUM_NAME_MAX_BYTES + 1);
		expect(albumNameSchema.safeParse(name).success).toBe(false);
	});

	it("rejects on bytes rather than characters", () => {
		// 64 emoji = 256 bytes but only 64 characters, so a character-based
		// limit would wrongly let this through.
		const name = "🍑".repeat(64);
		expect(name.length).toBeLessThan(ALBUM_NAME_MAX_BYTES);
		expect(albumNameSchema.safeParse(name).success).toBe(false);
	});
});
