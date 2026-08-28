/**
 * The single source of truth for the app's selectable colors.
 *
 * Three separate preferences draw from this list — the app accent, and the
 * outgoing and incoming message bubbles — and theme.svelte.ts writes the
 * resolved values onto the document as custom properties. Keeping them here
 * rather than in per-color CSS blocks means adding a color is one entry, and
 * the settings swatches can never drift out of sync with what the app renders.
 *
 * Entries are stored as oklch components rather than finished color strings so
 * a swatch and its contrast text are derived from one place. A `hex` overrides
 * the rendered color where a color has to match an exact sRGB value.
 *
 * The count is deliberate: thirteen colors plus `neutral` fills exactly two
 * rows of swatches on a phone. Adding a fourteenth spills onto a third row with
 * a single lonely circle on it, so swap rather than append.
 */

interface Swatch {
	label: string;
	l: number;
	c: number;
	h: number;
	/** Light enough that white text on it is illegible. */
	darkText?: boolean;
	/** Rendered instead of the oklch above; `h` still tints the contrast text. */
	hex?: string;
}

export const accentColors = [
	"forest",
	"green",
	"mint",
	"teal",
	"sky",
	"blue",
	"purple",
	"pink",
	"red",
	"orange",
	"yellow",
	"brown",
	"slate",
] as const;

export type AccentColor = (typeof accentColors)[number];

/**
 * Bubbles additionally accept `neutral`, which leaves the themed gray/slate
 * surface in place instead of tinting it.
 */
export const bubbleColors = [...accentColors, "neutral"] as const;

export type BubbleColor = (typeof bubbleColors)[number];

// Ordered as a hue wheel starting at green, with the dark/muted options last.
export const palette: Record<AccentColor, Swatch> = {
	// `forest` and `mint` are WhatsApp's outgoing bubble greens, given as the
	// exact hexes rather than an oklch approximation of them: the deep #005c4b it
	// uses in dark mode and the pale #d9fdd3 it uses in light. They're ordinary
	// palette entries, so either can be picked for any of the three color slots
	// in whichever theme you like.
	forest: { label: "Forest", l: 0.45, c: 0.08, h: 165, hex: "#005c4b" },
	green: { label: "Green", l: 0.62, c: 0.13, h: 168 },
	mint: {
		label: "Mint",
		l: 0.94,
		c: 0.06,
		h: 145,
		darkText: true,
		hex: "#d9fdd3",
	},
	teal: { label: "Teal", l: 0.6, c: 0.1, h: 195 },
	// `sky` and `yellow` are the official app's bubble colors, converted from
	// #45b2ef and #ffce00. Both are light, so their text flips to near-black —
	// which is what the official app does too.
	sky: { label: "Sky", l: 0.727, c: 0.132, h: 237, darkText: true },
	blue: { label: "Blue", l: 0.58, c: 0.16, h: 250 },
	purple: { label: "Purple", l: 0.55, c: 0.18, h: 305 },
	pink: { label: "Pink", l: 0.6, c: 0.2, h: 350 },
	red: { label: "Red", l: 0.58, c: 0.21, h: 25 },
	orange: { label: "Orange", l: 0.63, c: 0.17, h: 50 },
	yellow: { label: "Yellow", l: 0.869, c: 0.178, h: 91, darkText: true },
	brown: { label: "Brown", l: 0.5, c: 0.08, h: 50 },
	slate: { label: "Slate", l: 0.52, c: 0.03, h: 250 },
};

export interface Surface {
	value: string;
	contrast: string;
}

/** A color and the text color that sits legibly on top of it. */
export function surface(color: AccentColor): Surface {
	const { l, c, h, darkText, hex } = palette[color];
	return {
		value: hex ?? `oklch(${l} ${c} ${h})`,
		contrast: darkText ? `oklch(0.22 0.02 ${h})` : "oklch(1 0 0)",
	};
}

export function bubbleLabel(color: BubbleColor): string {
	return color === "neutral" ? "Neutral" : palette[color].label;
}
