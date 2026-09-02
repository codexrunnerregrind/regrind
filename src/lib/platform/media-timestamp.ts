// Photos and videos pulled off the CDN still carry the capture timestamps of
// whoever shot them, and both galleries file an import by those rather than by
// when it arrived — so a save lands months back in the user's own timeline.
// These rewrite the embedded timestamps to now, in place, leaving every other
// tag (orientation above all) alone.

/** Seconds between the QuickTime epoch (1904-01-01 UTC) and the Unix one. */
const EPOCH_1904_OFFSET = 2_082_844_800;

const TIFF_DATE_TAGS = new Set([
	0x0132, // DateTime
	0x9003, // DateTimeOriginal
	0x9004, // DateTimeDigitized
]);
const TIFF_SUB_IFD_TAGS = new Set([
	0x8769, // ExifIFD
	0x8825, // GPSInfo
]);
const TIFF_GPS_DATE_TAG = 0x001d; // GPSDateStamp, "YYYY:MM:DD"

const ISO_BMFF_MIME_TYPES = new Set([
	"video/mp4",
	"video/quicktime",
	"video/x-m4v",
	"audio/mp4",
]);

/**
 * Restamps `bytes` to `when`, in place, and hands the same array back. Formats
 * we can't parse — and malformed ones — are left as they are: a file that saves
 * with the wrong date beats one that doesn't save.
 */
export function restampMediaToNow(
	bytes: Uint8Array,
	mimeType: string,
	when: Date = new Date(),
): Uint8Array {
	try {
		if (mimeType === "image/jpeg") {
			restampJpeg(bytes, when);
		} else if (mimeType === "image/webp") {
			restampWebp(bytes, when);
		} else if (ISO_BMFF_MIME_TYPES.has(mimeType)) {
			restampIsoBmff(bytes, when);
		}
	} catch (error) {
		console.error(error);
	}
	return bytes;
}

/** `YYYY:MM:DD HH:MM:SS` in local time, which is how EXIF writes a date. */
function exifDate(when: Date): string {
	const pad = (value: number) => String(value).padStart(2, "0");
	return (
		`${when.getFullYear()}:${pad(when.getMonth() + 1)}:${pad(when.getDate())}` +
		` ${pad(when.getHours())}:${pad(when.getMinutes())}:${pad(when.getSeconds())}`
	);
}

// Walks the JPEG's segments for the APP1 that holds EXIF. Anything past the
// start of scan is pixels.
function restampJpeg(bytes: Uint8Array, when: Date): void {
	if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return;
	let offset = 2;
	while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
		const marker = bytes[offset + 1] ?? 0;
		// Standalone markers carry no payload.
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
			offset += 2;
			continue;
		}
		if (marker === 0xda) return;
		const length =
			((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
		if (length < 2) return;
		const payload = offset + 4;
		const end = offset + 2 + length;
		if (marker === 0xe1 && isExifHeader(bytes, payload)) {
			restampTiff(bytes, payload + 6, Math.min(end, bytes.length), when);
		}
		offset = end;
	}
}

function isExifHeader(bytes: Uint8Array, offset: number): boolean {
	return (
		bytes[offset] === 0x45 && // E
		bytes[offset + 1] === 0x78 && // x
		bytes[offset + 2] === 0x69 && // i
		bytes[offset + 3] === 0x66 && // f
		bytes[offset + 4] === 0x00 &&
		bytes[offset + 5] === 0x00
	);
}

// A WebP is RIFF chunks, one of which may be a verbatim EXIF block.
function restampWebp(bytes: Uint8Array, when: Date): void {
	if (
		readAscii(bytes, 0, 4) !== "RIFF" ||
		readAscii(bytes, 8, 4) !== "WEBP"
	) {
		return;
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let offset = 12;
	while (offset + 8 <= bytes.length) {
		const type = readAscii(bytes, offset, 4);
		const size = view.getUint32(offset + 4, true);
		const payload = offset + 8;
		if (payload + size > bytes.length) return;
		if (type === "EXIF") {
			// Some encoders prepend the JPEG-style header here too.
			const start = isExifHeader(bytes, payload) ? payload + 6 : payload;
			restampTiff(bytes, start, payload + size, when);
			return;
		}
		// Chunks are padded to an even length.
		offset = payload + size + (size % 2);
	}
}

/**
 * Rewrites every date in the TIFF block starting at `tiffStart`. Values are
 * fixed-length ASCII, so each is overwritten where it sits and no offset in the
 * block has to move.
 */
function restampTiff(
	bytes: Uint8Array,
	tiffStart: number,
	end: number,
	when: Date,
): void {
	if (tiffStart + 8 > end) return;
	const byteOrder = readAscii(bytes, tiffStart, 2);
	if (byteOrder !== "II" && byteOrder !== "MM") return;
	const little = byteOrder === "II";
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint16(tiffStart + 2, little) !== 42) return;

	const stamp = exifDate(when);
	const seen = new Set<number>();
	const pending = [view.getUint32(tiffStart + 4, little)];
	while (pending.length > 0) {
		const ifd = pending.pop();
		// A pointer loop would otherwise spin forever.
		if (ifd === undefined || ifd === 0 || seen.has(ifd)) continue;
		seen.add(ifd);
		const ifdStart = tiffStart + ifd;
		if (ifdStart + 2 > end) continue;
		const entries = view.getUint16(ifdStart, little);
		const entriesEnd = ifdStart + 2 + entries * 12;
		if (entriesEnd + 4 > end) continue;
		for (let index = 0; index < entries; index += 1) {
			const entry = ifdStart + 2 + index * 12;
			const tag = view.getUint16(entry, little);
			const count = view.getUint32(entry + 4, little);
			if (TIFF_SUB_IFD_TAGS.has(tag)) {
				pending.push(view.getUint32(entry + 8, little));
				continue;
			}
			const isDate = TIFF_DATE_TAGS.has(tag);
			if (!isDate && tag !== TIFF_GPS_DATE_TAG) continue;
			const text = isDate ? stamp : stamp.slice(0, 10);
			// ASCII this long is always stored out of line.
			if (count < text.length + 1) continue;
			const value = tiffStart + view.getUint32(entry + 8, little);
			if (value < tiffStart || value + count > end) continue;
			writeAscii(bytes, value, text);
			bytes.fill(0, value + text.length, value + count);
		}
		pending.push(view.getUint32(entriesEnd, little));
	}
}

/**
 * Rewrites the creation and modification times in an MP4/MOV header. Only the
 * fixed-width fields of `mvhd`, `tkhd` and `mdhd` are touched — the free-text
 * dates some cameras also write into `udta` are variable length, so moving them
 * would mean rebuilding the file.
 */
function restampIsoBmff(bytes: Uint8Array, when: Date): void {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const seconds = Math.floor(when.getTime() / 1000) + EPOCH_1904_OFFSET;
	walkBoxes(bytes, view, 0, bytes.length, seconds);
}

const CONTAINER_BOXES = new Set(["moov", "trak", "mdia", "edts"]);
const HEADER_BOXES = new Set(["mvhd", "tkhd", "mdhd"]);

function walkBoxes(
	bytes: Uint8Array,
	view: DataView,
	start: number,
	end: number,
	seconds: number,
): void {
	let offset = start;
	while (offset + 8 <= end) {
		const declared = view.getUint32(offset, false);
		const type = readAscii(bytes, offset + 4, 4);
		let header = 8;
		let size = declared;
		if (declared === 1) {
			// 64-bit size, in the eight bytes after the type.
			if (offset + 16 > end) return;
			size = Number(view.getBigUint64(offset + 8, false));
			header = 16;
		} else if (declared === 0) {
			size = end - offset;
		}
		if (size < header || offset + size > end) return;
		if (CONTAINER_BOXES.has(type)) {
			walkBoxes(bytes, view, offset + header, offset + size, seconds);
		} else if (HEADER_BOXES.has(type)) {
			writeBoxTimes(view, offset + header, offset + size, seconds);
		}
		offset += size;
	}
}

// Version byte, three flag bytes, then creation and modification times.
function writeBoxTimes(
	view: DataView,
	start: number,
	end: number,
	seconds: number,
): void {
	const version = view.getUint8(start);
	const times = start + 4;
	if (version === 1) {
		if (times + 16 > end) return;
		view.setBigUint64(times, BigInt(seconds), false);
		view.setBigUint64(times + 8, BigInt(seconds), false);
		return;
	}
	if (times + 8 > end) return;
	view.setUint32(times, seconds, false);
	view.setUint32(times + 4, seconds, false);
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
	let text = "";
	for (let index = 0; index < length; index += 1) {
		text += String.fromCharCode(bytes[offset + index] ?? 0);
	}
	return text;
}

function writeAscii(bytes: Uint8Array, offset: number, text: string): void {
	for (let index = 0; index < text.length; index += 1) {
		bytes[offset + index] = text.charCodeAt(index);
	}
}
