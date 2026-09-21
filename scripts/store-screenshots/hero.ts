import sharp from "sharp";
import { writeEncodings } from "./encoding";

const CONTRIB_DIR = Bun.fileURLToPath(
	new URL("../../contrib/", import.meta.url),
);
const SOURCE = `${CONTRIB_DIR}hero-source.png`;
const HERO_NAME = "hero";
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

const PHONES = 3;
const LAYOUTS = { "1x3": [0, 1, 2], "1x2": [0, 2] };

type Span = { start: number; end: number };

const spanLength = ({ start, end }: Span) => end - start + 1;

function opaqueSpans(opaque: boolean[]): Span[] {
	const spans: Span[] = [];
	opaque.forEach((isOpaque, index) => {
		if (!isOpaque) return;
		const last = spans.at(-1);
		if (last?.end === index - 1) last.end = index;
		else spans.push({ start: index, end: index });
	});
	return spans;
}

const { data: alpha, info } = await sharp(SOURCE)
	.ensureAlpha()
	.extractChannel("alpha")
	.raw()
	.toBuffer({ resolveWithObject: true });
const opaqueColumns = new Array<boolean>(info.width).fill(false);
const opaqueRows = new Array<boolean>(info.height).fill(false);
for (let y = 0; y < info.height; y++) {
	for (let x = 0; x < info.width; x++) {
		if (alpha[y * info.width + x] === 0) continue;
		opaqueColumns[x] = true;
		opaqueRows[y] = true;
	}
}

const phones = opaqueSpans(opaqueColumns);
if (phones.length !== PHONES) {
	throw new Error(
		`${SOURCE} has ${phones.length} phones separated by transparent columns, not ${PHONES}`,
	);
}
const rows = {
	start: opaqueRows.indexOf(true),
	end: opaqueRows.lastIndexOf(true),
};

function phoneAt(index: number): Span {
	const phone = phones[index];
	if (!phone) {
		throw new Error(
			`${SOURCE} has no phone ${index}, only ${phones.length}`,
		);
	}
	return phone;
}

function gapBefore(index: number): number {
	const [left, right] =
		index > 0
			? [phoneAt(index - 1), phoneAt(index)]
			: [phoneAt(0), phoneAt(1)];
	return right.start - left.end - 1;
}

async function compose(indices: number[]): Promise<Buffer> {
	let width = 0;
	const placements = indices.map((index, position) => {
		const phone = phoneAt(index);
		if (position > 0) width += gapBefore(index);
		const placement = { phone, left: width };
		width += spanLength(phone);
		return placement;
	});
	const height = spanLength(rows);
	const strips = await Promise.all(
		placements.map(async ({ phone, left }) => ({
			input: await sharp(SOURCE)
				.extract({
					left: phone.start,
					top: rows.start,
					width: spanLength(phone),
					height,
				})
				.toBuffer(),
			left,
			top: 0,
		})),
	);
	return sharp({
		create: { width, height, channels: 4, background: TRANSPARENT },
	})
		.composite(strips)
		.png()
		.toBuffer();
}

for (const [name, indices] of Object.entries(LAYOUTS)) {
	await writeEncodings({
		image: await compose(indices),
		basePath: `${CONTRIB_DIR}${HERO_NAME}-${name}`,
	});
}
