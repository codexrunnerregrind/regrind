import sharp from "sharp";
import { writeEncodings } from "./encoding";

const SCREENSHOTS_DIR = Bun.fileURLToPath(
	new URL(
		"../../fastlane/metadata/android/en-US/images/phoneScreenshots/",
		import.meta.url,
	),
);
const GRIDS_DIR = Bun.fileURLToPath(new URL("../../contrib/", import.meta.url));
const GRID_NAME = "app-screenshots";

const SCREENSHOT = { width: 1080, height: 1920 };
const TILE = { width: 540, height: 960 };
const GAP = 48;
const CORNER_RADIUS = 38;
const RIM_WIDTH = 3;
const RIM_COLOR = "rgba(255,255,255,0.25)";
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

const SCENES = 6;
const GRID_COLUMNS = { "1x6": 6, "3x2": 3, "2x3": 2 };

const CORNER_MASK = Buffer.from(
	`<svg xmlns="http://www.w3.org/2000/svg" width="${TILE.width}" height="${TILE.height}">` +
		`<rect width="${TILE.width}" height="${TILE.height}" rx="${CORNER_RADIUS}" fill="#fff"/>` +
		`</svg>`,
);
const RIM = Buffer.from(
	`<svg xmlns="http://www.w3.org/2000/svg" width="${TILE.width}" height="${TILE.height}">` +
		`<rect x="${RIM_WIDTH / 2}" y="${RIM_WIDTH / 2}" width="${TILE.width - RIM_WIDTH}" height="${TILE.height - RIM_WIDTH}" ` +
		`rx="${CORNER_RADIUS - RIM_WIDTH / 2}" fill="none" stroke="${RIM_COLOR}" stroke-width="${RIM_WIDTH}"/>` +
		`</svg>`,
);

async function screenshotPaths(): Promise<string[]> {
	const files = await Array.fromAsync(
		new Bun.Glob("*.jpeg").scan(SCREENSHOTS_DIR),
	);
	if (files.length !== SCENES) {
		throw new Error(
			`${SCREENSHOTS_DIR} holds ${files.length} screenshots, not the ${SCENES} the grids are laid out for`,
		);
	}
	return files
		.sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
		.map((file) => `${SCREENSHOTS_DIR}${file}`);
}

async function roundedTile(path: string): Promise<Buffer> {
	const screenshot = sharp(path);
	const { width, height } = await screenshot.metadata();
	if (width !== SCREENSHOT.width || height !== SCREENSHOT.height) {
		throw new Error(
			`${path} is ${width}x${height}, not the ${SCREENSHOT.width}x${SCREENSHOT.height} every phone screenshot must be`,
		);
	}
	const rounded = await screenshot
		.resize(TILE.width, TILE.height, { kernel: "lanczos3" })
		.composite([{ input: CORNER_MASK, blend: "dest-in" }])
		.png()
		.toBuffer();
	return sharp(rounded)
		.composite([{ input: RIM }])
		.png()
		.toBuffer();
}

async function grid({
	tiles,
	columns,
}: {
	tiles: Buffer[];
	columns: number;
}): Promise<Buffer> {
	const rows = tiles.length / columns;
	if (!Number.isInteger(rows)) {
		throw new Error(
			`${tiles.length} screenshots do not fill rows of ${columns}`,
		);
	}
	return sharp({
		create: {
			width: columns * TILE.width + (columns - 1) * GAP,
			height: rows * TILE.height + (rows - 1) * GAP,
			channels: 4,
			background: TRANSPARENT,
		},
	})
		.composite(
			tiles.map((input, index) => ({
				input,
				left: (index % columns) * (TILE.width + GAP),
				top: Math.floor(index / columns) * (TILE.height + GAP),
			})),
		)
		.png()
		.toBuffer();
}

const tiles = await Promise.all((await screenshotPaths()).map(roundedTile));

for (const [name, columns] of Object.entries(GRID_COLUMNS)) {
	await writeEncodings({
		image: await grid({ tiles, columns }),
		basePath: `${GRIDS_DIR}${GRID_NAME}-${name}`,
	});
}
