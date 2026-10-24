// bun scripts/gen-app-icons.ts
//
// Draws the alternate ("discreet") app icons, every glyph in every color, and
// writes each platform's copy: the preview SVGs the settings screen shows, the
// iOS alternate icon sets and the Android adaptive icons, plus the Xcode
// setting and manifest aliases that list them.

import { $ } from "bun";
import {
	copyFileSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "fs";
import { join } from "path";

import {
	allAppIconIds,
	androidAppIconAlias,
	type AppIconColor,
	appIconColors,
	type AppIconGlyph,
	appIconId,
	type AppIconId,
	appIcons,
	iosAppIconName,
} from "../src/lib/platform/app-icon-catalog.ts";

type Shape = {
	d: string;
	fill?: string;
	opacity?: number;
	stroke?: string;
	width?: number;
	evenodd?: boolean;
};

type Design = {
	glyph: (palette: Palette, color: AppIconColor) => Shape[];
	/** Themed icons (Android, iOS tinted): one flat colour, detail cut out. */
	mono: Shape[];
	/** Grows a glyph that reads small next to the others. */
	scale?: number;
};

const PREVIEWS = "src/lib/assets/app-icons";
const RES = "src-tauri/gen/android/app/src/main/res";
const XCASSETS = "src-tauri/gen/apple/Assets.xcassets";
const MANIFEST = "src-tauri/gen/android/app/src/main/AndroidManifest.xml";
const PBXPROJ = "src-tauri/gen/apple/regrind.xcodeproj/project.pbxproj";
const PROJECT_YML = "src-tauri/gen/apple/project.yml";

// Glyphs sit in roughly 116..396 of 512, which is right for iOS; Android's
// 66dp safe circle needs them smaller.
const ANDROID_GLYPH_SCALE = 0.78;

function rrect(x: number, y: number, w: number, h: number, r: number) {
	return (
		`M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}` +
		`V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` +
		`H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}` +
		`V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
	);
}

function ellipse(cx: number, cy: number, rx: number, ry = rx) {
	return (
		`M${cx - rx} ${cy}A${rx} ${ry} 0 1 1 ${cx + rx} ${cy}` +
		`A${rx} ${ry} 0 1 1 ${cx - rx} ${cy}Z`
	);
}

function line(x1: number, y1: number, x2: number, y2: number) {
	return `M${x1} ${y1}L${x2} ${y2}`;
}

const WHITE = "#FFFFFF";

function white(d: string, extra: Partial<Shape> = {}): Shape {
	return { d, fill: WHITE, ...extra };
}

function stroke(d: string, color: string, width: number): Shape {
	return { d, stroke: color, width };
}

const cloud = [
	ellipse(206, 298, 62),
	ellipse(282, 264, 78),
	ellipse(342, 314, 50),
	rrect(124, 288, 268, 110, 55),
];

const calculatorKeys = [
	[134, 134],
	[262, 134],
	[134, 262],
	[262, 262],
] as const;

const calculatorSymbols = [
	line(170, 192, 214, 192),
	line(298, 192, 342, 192),
	line(320, 170, 320, 214),
	line(176, 304, 208, 336),
	line(208, 304, 176, 336),
	line(298, 310, 342, 310),
	line(298, 330, 342, 330),
];

const clockHands = [
	[line(256, 256, 200.6, 224), 18],
	[line(256, 256, 340.9, 207), 12],
] as const;

const clockTicks = [
	line(256, 138, 256, 160),
	line(374, 256, 352, 256),
	line(256, 374, 256, 352),
	line(138, 256, 160, 256),
];

const chatBubble = ellipse(256, 236, 140, 108);
const chatTail = "M176 322C172 352 156 374 134 390C184 392 226 372 252 342Z";
const chatDots = [
	ellipse(198, 236, 20),
	ellipse(256, 236, 20),
	ellipse(314, 236, 20),
];

type Palette = { accent: string; soft: string; deep: string };

const palettes: Record<AppIconColor, Palette> = {
	blue: { accent: "#2F7BEA", soft: "#9CC8F5", deep: "#123E80" },
	teal: { accent: "#18A595", soft: "#6FD6C3", deep: "#0B5A53" },
	green: { accent: "#1FB056", soft: "#8FE3AC", deep: "#0F6B31" },
	purple: { accent: "#6A3EF0", soft: "#B7A8F5", deep: "#2A1B7A" },
	red: { accent: "#E5394F", soft: "#F5A3AB", deep: "#7A1422" },
	orange: { accent: "#F59316", soft: "#F7C98A", deep: "#7A4300" },
	graphite: { accent: "#2C2C34", soft: "#A0A0AA", deep: "#1B1B20" },
};

const photoCard = rrect(120, 148, 272, 216, 40);
const photoPeaks = ["M156 332L228 248L300 332Z", "M300 332L334 292L368 332Z"];
const photoSun = ellipse(318, 212, 24);

const designs: Record<AppIconGlyph, Design> = {
	weather: {
		glyph: () => [
			{ d: ellipse(318, 200, 90), fill: "#FFE27A", opacity: 0.35 },
			{ d: ellipse(318, 200, 64), fill: "#FFD23F" },
			...cloud.map((d) => white(d)),
		],
		mono: [ellipse(318, 200, 64), ...cloud].map((d) => white(d)),
	},
	notes: {
		glyph: () => [
			white(rrect(140, 112, 232, 288, 36)),
			{
				d: "M140 148A36 36 0 0 1 176 112H336A36 36 0 0 1 372 148V172H140Z",
				fill: "#FF7A45",
			},
			...[214, 262].map((y) => ({
				d: rrect(176, y, 160, 16, 8),
				fill: "#F0B93A",
			})),
			{ d: rrect(176, 310, 104, 16, 8), fill: "#F0B93A" },
		],
		scale: 1.08,
		mono: [
			white(
				[
					rrect(140, 112, 232, 288, 36),
					rrect(176, 214, 160, 16, 8),
					rrect(176, 262, 160, 16, 8),
					rrect(176, 310, 104, 16, 8),
				].join(""),
				{ evenodd: true },
			),
		],
	},
	calculator: {
		// The orange "=" key would vanish on orange, so it turns white there.
		glyph: ({ accent }, color) => {
			const [minus, plus1, plus2, times1, times2, equals1, equals2] =
				calculatorSymbols as [string, ...string[]];
			const key = (
				[x, y]: readonly [number, number],
				fill: string,
				opacity?: number,
			) => ({ d: rrect(x, y, 116, 116, 34), fill, opacity });
			const [tl, tr, bl, br] = calculatorKeys;
			const orange = color === "orange";
			return [
				key(tl, WHITE),
				key(tr, WHITE, 0.24),
				key(bl, WHITE, 0.24),
				key(br, orange ? WHITE : "#FF9F0A"),
				stroke(minus, accent, 14),
				...[plus1, plus2, times1, times2].map((d) =>
					stroke(d!, WHITE, 14),
				),
				...[equals1, equals2].map((d) =>
					stroke(d!, orange ? accent : WHITE, 14),
				),
			];
		},
		mono: [
			...calculatorKeys.map(([x, y]) =>
				stroke(rrect(x + 6, y + 6, 104, 104, 28), WHITE, 12),
			),
			...calculatorSymbols.map((d) => stroke(d, WHITE, 14)),
		],
		scale: 1.18,
	},
	camera: {
		glyph: () => [
			white(rrect(196, 140, 120, 60, 22)),
			white(rrect(116, 172, 280, 204, 48)),
			{ d: ellipse(256, 276, 74), fill: "#3A3E48" },
			{ d: ellipse(256, 276, 54), fill: "#141821" },
			{ d: ellipse(256, 276, 34), fill: "#24345C" },
			{ d: ellipse(274, 258, 12), fill: WHITE, opacity: 0.7 },
			{ d: ellipse(350, 216, 11), fill: "#FFC93C" },
		],
		scale: 1.04,
		mono: [
			white(rrect(196, 140, 120, 60, 22)),
			white(
				rrect(116, 172, 280, 204, 48) +
					ellipse(256, 276, 74) +
					ellipse(350, 216, 11),
				{ evenodd: true },
			),
			white(ellipse(256, 276, 50)),
		],
	},
	clock: {
		glyph: ({ soft, deep }) => [
			white(ellipse(256, 256, 138)),
			...clockTicks.map((d) => stroke(d, soft, 10)),
			...clockHands.map(([d, w]) => stroke(d, deep, w)),
			stroke("M264.2 233.4L219.1 357.5", "#FF5A5F", 6),
			{ d: ellipse(256, 256, 12), fill: "#FF5A5F" },
			white(ellipse(256, 256, 5)),
		],
		mono: [
			white(ellipse(256, 256, 138) + ellipse(256, 256, 118), {
				evenodd: true,
			}),
			...clockTicks.map((d) => stroke(d, WHITE, 10)),
			...clockHands.map(([d, w]) => stroke(d, WHITE, w)),
			white(ellipse(256, 256, 14)),
		],
	},
	chat: {
		glyph: ({ accent }) => [
			white(chatTail),
			white(chatBubble),
			...chatDots.map((d) => ({ d, fill: accent })),
		],
		mono: [
			white(chatTail),
			white(chatBubble + chatDots.join(""), { evenodd: true }),
		],
	},
	photos: {
		glyph: ({ accent, soft }) => [
			white(photoCard),
			{ d: photoPeaks[0]!, fill: accent },
			{ d: photoPeaks[1]!, fill: soft },
			{ d: photoSun, fill: "#FFC93C" },
		],
		mono: [
			white(photoCard + photoPeaks.join("") + photoSun, {
				evenodd: true,
			}),
		],
	},
};

function svgShape(shape: Shape) {
	const attributes = [`d="${shape.d}"`];
	attributes.push(`fill="${shape.fill ?? "none"}"`);
	if (shape.opacity !== undefined)
		attributes.push(`fill-opacity="${shape.opacity}"`);
	if (shape.evenodd) attributes.push(`fill-rule="evenodd"`);
	if (shape.stroke)
		attributes.push(
			`stroke="${shape.stroke}"`,
			`stroke-width="${shape.width}"`,
			`stroke-linecap="round"`,
			`stroke-linejoin="round"`,
		);
	return `  <path ${attributes.join(" ")}/>`;
}

// `background` null leaves it transparent, for the iOS dark and tinted icons.
function iconSvg(
	background: { top: string; bottom: string } | null,
	shapes: Shape[],
	scale = 1,
) {
	const backdrop = background
		? [
				`  <defs>`,
				`    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">`,
				`      <stop offset="0" stop-color="${background.top}"/>`,
				`      <stop offset="1" stop-color="${background.bottom}"/>`,
				`    </linearGradient>`,
				`  </defs>`,
				`  <rect width="512" height="512" fill="url(#bg)"/>`,
			]
		: [];
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">`,
		...backdrop,
		`  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">`,
		...shapes.map((shape) => `  ${svgShape(shape)}`),
		`  </g>`,
		`</svg>`,
		``,
	].join("\n");
}

function argb(color: string, opacity?: number) {
	if (opacity === undefined) return color;
	const alpha = Math.round(opacity * 255)
		.toString(16)
		.padStart(2, "0")
		.toUpperCase();
	return `#${alpha}${color.slice(1)}`;
}

function vectorShape(shape: Shape) {
	const lines = [];
	if (shape.fill)
		lines.push(`android:fillColor="${argb(shape.fill, shape.opacity)}"`);
	if (shape.evenodd) lines.push(`android:fillType="evenOdd"`);
	if (shape.stroke)
		lines.push(
			`android:strokeColor="${shape.stroke}"`,
			`android:strokeWidth="${shape.width}"`,
			`android:strokeLineCap="round"`,
			`android:strokeLineJoin="round"`,
		);
	lines.push(`android:pathData="${shape.d}"`);
	return `        <path\n${lines.map((l) => `            ${l}`).join("\n")} />`;
}

const GENERATED = `<!-- Generated by scripts/gen-app-icons.ts. Do not edit by hand. -->`;

function vector(body: string, namespaces = "") {
	return [
		`<?xml version="1.0" encoding="utf-8"?>`,
		GENERATED,
		`<vector xmlns:android="http://schemas.android.com/apk/res/android"${namespaces}`,
		`    android:width="108dp"`,
		`    android:height="108dp"`,
		`    android:viewportWidth="512"`,
		`    android:viewportHeight="512">`,
		body,
		`</vector>`,
		``,
	].join("\n");
}

function glyphVector(shapes: Shape[], scale = 1) {
	const s = +(ANDROID_GLYPH_SCALE * scale).toFixed(4);
	return vector(
		[
			`    <group`,
			`        android:scaleX="${s}"`,
			`        android:scaleY="${s}"`,
			`        android:pivotX="256"`,
			`        android:pivotY="256">`,
			...shapes.map(vectorShape),
			`    </group>`,
		].join("\n"),
	);
}

// The adaptive canvas is 108dp but only the middle 72dp shows, so the
// gradient spans that window rather than the whole viewport.
function backgroundVector({ top, bottom }: { top: string; bottom: string }) {
	return vector(
		[
			`    <path android:pathData="M0 0H512V512H0Z">`,
			`        <aapt:attr name="android:fillColor">`,
			`            <gradient`,
			`                android:type="linear"`,
			`                android:startX="0"`,
			`                android:startY="85"`,
			`                android:endX="0"`,
			`                android:endY="427"`,
			`                android:startColor="${top}"`,
			`                android:endColor="${bottom}" />`,
			`        </aapt:attr>`,
			`    </path>`,
		].join("\n"),
		`\n    xmlns:aapt="http://schemas.android.com/aapt"`,
	);
}

// Generated Android files share this prefix so a rerun can clear them.
const ALT = "ic_launcher_alt";

function adaptiveIcon(glyph: AppIconGlyph, color: AppIconColor) {
	return [
		`<?xml version="1.0" encoding="utf-8"?>`,
		GENERATED,
		`<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">`,
		`  <foreground android:drawable="@drawable/${ALT}_${glyph}_${color}"/>`,
		`  <background android:drawable="@drawable/${ALT}_bg_${color}"/>`,
		`  <monochrome android:drawable="@drawable/${ALT}_${glyph}_monochrome"/>`,
		`</adaptive-icon>`,
		``,
	].join("\n");
}

function launcherAlias(id: AppIconId, label: string) {
	return [
		``,
		`\t\t<activity-alias`,
		`\t\t\tandroid:name=".${androidAppIconAlias(id)}"`,
		`\t\t\tandroid:targetActivity=".MainActivity"`,
		`\t\t\tandroid:enabled="false"`,
		`\t\t\tandroid:exported="true"`,
		`\t\t\tandroid:icon="@mipmap/${ALT}_${id.replace("-", "_")}"`,
		`\t\t\tandroid:label="${label}">`,
		`\t\t\t<intent-filter>`,
		`\t\t\t\t<action android:name="android.intent.action.MAIN" />`,
		`\t\t\t\t<category android:name="android.intent.category.LAUNCHER" />`,
		`\t\t\t\t<category android:name="android.intent.category.LEANBACK_LAUNCHER" />`,
		`\t\t\t</intent-filter>`,
		`\t\t</activity-alias>`,
	].join("\n");
}

function replaceBetween(
	text: string,
	start: string,
	end: string,
	body: string,
) {
	const from = text.indexOf(start);
	const to = text.indexOf(end);
	if (from < 0 || to < from) throw new Error(`markers ${start} not found`);
	return (
		text.slice(0, from + start.length) + body + "\n\t\t" + text.slice(to)
	);
}

const iosImage = (filename: string, appearance?: string) => ({
	...(appearance && {
		appearances: [{ appearance: "luminosity", value: appearance }],
	}),
	filename,
	idiom: "universal",
	platform: "ios",
	size: "1024x1024",
});

const IOS_CONTENTS = `${JSON.stringify(
	{
		images: [
			iosImage("AppIcon.png"),
			iosImage("AppIcon-Dark.png", "dark"),
			iosImage("AppIcon-Tinted.png", "tinted"),
		],
		info: { author: "xcode", version: 1 },
	},
	null,
	2,
)}\n`;

function clear(dir: string, match: (name: string) => boolean) {
	for (const name of readdirSync(dir))
		if (match(name))
			rmSync(join(dir, name), { recursive: true, force: true });
}

clear(PREVIEWS, (name) => name !== "default.svg");
clear(join(RES, "drawable"), (name) => name.startsWith(ALT));
clear(join(RES, "mipmap-anydpi-v26"), (name) => name.startsWith(ALT));
clear(
	XCASSETS,
	(name) => name.startsWith("AppIcon-") && name !== "AppIcon-Dev.appiconset",
);
copyFileSync("contrib/logo/app-icon.svg", join(PREVIEWS, "default.svg"));

for (const color of appIconColors)
	writeFileSync(
		join(RES, "drawable", `${ALT}_bg_${color.id}.xml`),
		backgroundVector(color),
	);

async function writeIcon(
	tmp: string,
	glyph: AppIconGlyph,
	color: (typeof appIconColors)[number],
) {
	const design = designs[glyph];
	const id = appIconId(glyph, color.id);
	const shapes = design.glyph(palettes[color.id], color.id);
	const preview = join(PREVIEWS, `${id}.svg`);
	writeFileSync(preview, iconSvg(color, shapes, design.scale));

	writeFileSync(
		join(RES, "drawable", `${ALT}_${glyph}_${color.id}.xml`),
		glyphVector(shapes, design.scale),
	);
	writeFileSync(
		join(RES, "mipmap-anydpi-v26", `${ALT}_${glyph}_${color.id}.xml`),
		adaptiveIcon(glyph, color.id),
	);

	const set = join(XCASSETS, `${iosAppIconName(id)}.appiconset`);
	mkdirSync(set);
	await $`bun tauri icon ${preview} -o ${join(tmp, id)}`.quiet();
	copyFileSync(
		join(tmp, id, "ios", "AppIcon-512@2x.png"),
		join(set, "AppIcon.png"),
	);
	// Dark sits on the system's own dark backdrop; tinted is recoloured by iOS.
	for (const [variant, layer] of [
		["Dark", shapes],
		["Tinted", design.mono],
	] as const) {
		const source = join(tmp, `${id}-${variant}.svg`);
		writeFileSync(source, iconSvg(null, layer, design.scale));
		await $`bun tauri icon ${source} --png 1024 -o ${join(tmp, id, variant)}`.quiet();
		copyFileSync(
			join(tmp, id, variant, "1024x1024.png"),
			join(set, `AppIcon-${variant}.png`),
		);
	}
	writeFileSync(join(set, "Contents.json"), IOS_CONTENTS);
}

const tmp = (await $`mktemp -d`.text()).trim();
try {
	for (const { id: glyph, label } of appIcons) {
		writeFileSync(
			join(RES, "drawable", `${ALT}_${glyph}_monochrome.xml`),
			glyphVector(designs[glyph].mono, designs[glyph].scale),
		);
		await Promise.all(
			appIconColors.map((color) => writeIcon(tmp, glyph, color)),
		);
		console.log(`wrote ${label}`);
	}
} finally {
	rmSync(tmp, { recursive: true, force: true });
}

const labels = new Map(appIcons.map(({ id, label }) => [id, label]));
writeFileSync(
	MANIFEST,
	replaceBetween(
		readFileSync(MANIFEST, "utf8"),
		"<!-- gen-app-icons: aliases -->",
		"<!-- /gen-app-icons -->",
		allAppIconIds
			.map((id) =>
				launcherAlias(
					id,
					labels.get(id.split("-")[0] as AppIconGlyph)!,
				),
			)
			.join("\n"),
	),
);

const iosNames = allAppIconIds.map(iosAppIconName).join(" ");
writeFileSync(
	PBXPROJ,
	readFileSync(PBXPROJ, "utf8").replace(
		/ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = "[^"]*";/g,
		`ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = "${iosNames}";`,
	),
);
writeFileSync(
	PROJECT_YML,
	readFileSync(PROJECT_YML, "utf8").replace(
		/ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES: .*/,
		`ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES: ${iosNames}`,
	),
);
