import { describe, expect, it } from "vitest";

import { restampMediaToNow } from "./media-timestamp";

const WHEN = new Date(2026, 8, 2, 14, 5, 6);
const STAMP = "2026:09:02 14:05:06";

/** A TIFF block with a DateTime in IFD0 and a DateTimeOriginal in the ExifIFD. */
function exifBlock(date: string): Uint8Array {
	const bytes = new Uint8Array(120);
	const view = new DataView(bytes.buffer);
	writeAscii(bytes, 0, "II");
	view.setUint16(2, 42, true);
	view.setUint32(4, 8, true); // IFD0
	// IFD0: DateTime, ExifIFD pointer, Orientation.
	view.setUint16(8, 3, true);
	entry(view, 10, 0x0132, 2, 20, 60);
	entry(view, 22, 0x8769, 4, 1, 46);
	entry(view, 34, 0x0112, 3, 1, 6 << 16);
	view.setUint32(8 + 2 + 36, 0, true); // no IFD1
	// ExifIFD: DateTimeOriginal.
	view.setUint16(46, 1, true);
	entry(view, 48, 0x9003, 2, 20, 80);
	view.setUint32(60 + 0, 0, true);
	writeAscii(bytes, 60, date);
	writeAscii(bytes, 80, date);
	return bytes;
}

function entry(
	view: DataView,
	offset: number,
	tag: number,
	type: number,
	count: number,
	value: number,
): void {
	view.setUint16(offset, tag, true);
	view.setUint16(offset + 2, type, true);
	view.setUint32(offset + 4, count, true);
	view.setUint32(offset + 8, value, true);
}

function writeAscii(bytes: Uint8Array, offset: number, text: string): void {
	for (let index = 0; index < text.length; index += 1) {
		bytes[offset + index] = text.charCodeAt(index);
	}
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
	return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function jpegWithExif(date: string): Uint8Array {
	const exif = exifBlock(date);
	const length = 2 + 6 + exif.length;
	const bytes = new Uint8Array(4 + length + 2);
	bytes.set([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff], 0);
	writeAscii(bytes, 6, "Exif");
	bytes.set(exif, 12);
	bytes.set([0xff, 0xda], 12 + exif.length);
	return bytes;
}

/** `ftyp` + `moov` with an `mvhd`, plus a `trak/mdia/mdhd` under it. */
function mp4(seconds: number): Uint8Array {
	const mvhd = box(
		"mvhd",
		(view, at) => {
			view.setUint32(at, 0); // version + flags
			view.setUint32(at + 4, seconds);
			view.setUint32(at + 8, seconds);
		},
		100,
	);
	const mdhd = box(
		"mdhd",
		(view, at) => {
			view.setUint8(at, 1); // 64-bit times
			view.setBigUint64(at + 4, BigInt(seconds));
			view.setBigUint64(at + 12, BigInt(seconds));
		},
		32,
	);
	const mdia = wrap("mdia", mdhd);
	const trak = wrap("trak", mdia);
	return concat(
		wrap("ftyp", new Uint8Array(8)),
		wrap("moov", concat(mvhd, trak)),
	);
}

function box(
	type: string,
	fill: (view: DataView, at: number) => void,
	payload: number,
): Uint8Array {
	const bytes = new Uint8Array(8 + payload);
	const view = new DataView(bytes.buffer);
	view.setUint32(0, bytes.length);
	writeAscii(bytes, 4, type);
	fill(view, 8);
	return bytes;
}

function wrap(type: string, payload: Uint8Array): Uint8Array {
	return box(type, (_, at) => void at, payload.length).map((byte, index) =>
		index < 8 ? byte : (payload[index - 8] ?? 0),
	);
}

function concat(...parts: Uint8Array[]): Uint8Array {
	const total = parts.reduce((sum, part) => sum + part.length, 0);
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		bytes.set(part, offset);
		offset += part.length;
	}
	return bytes;
}

describe("restampMediaToNow", () => {
	it("rewrites every EXIF date in a JPEG", () => {
		const bytes = jpegWithExif("2019:03:04 05:06:07");

		restampMediaToNow(bytes, "image/jpeg", WHEN);

		expect(readAscii(bytes, 12 + 60, 19)).toBe(STAMP);
		expect(readAscii(bytes, 12 + 80, 19)).toBe(STAMP);
	});

	it("leaves the orientation tag alone", () => {
		const bytes = jpegWithExif("2019:03:04 05:06:07");
		const before = bytes.slice(12 + 34, 12 + 46);

		restampMediaToNow(bytes, "image/jpeg", WHEN);

		expect(bytes.slice(12 + 34, 12 + 46)).toEqual(before);
	});

	it("rewrites the header times of an MP4, 32- and 64-bit alike", () => {
		const bytes = mp4(3_000_000_000);
		const expected = Math.floor(WHEN.getTime() / 1000) + 2_082_844_800;

		restampMediaToNow(bytes, "video/mp4", WHEN);

		const view = new DataView(bytes.buffer);
		const moov = 16;
		const mvhd = moov + 8;
		expect(view.getUint32(mvhd + 12)).toBe(expected);
		expect(view.getUint32(mvhd + 16)).toBe(expected);
		const mdhd = mvhd + 108 + 8 + 8;
		expect(readAscii(bytes, mdhd + 4, 4)).toBe("mdhd");
		expect(Number(view.getBigUint64(mdhd + 12))).toBe(expected);
		expect(Number(view.getBigUint64(mdhd + 20))).toBe(expected);
	});

	it("hands back media it can't parse untouched", () => {
		const bytes = new Uint8Array([1, 2, 3, 4, 5]);

		expect(restampMediaToNow(bytes, "image/jpeg", WHEN)).toEqual(
			new Uint8Array([1, 2, 3, 4, 5]),
		);
		expect(restampMediaToNow(bytes, "image/gif", WHEN)).toEqual(
			new Uint8Array([1, 2, 3, 4, 5]),
		);
	});
});
