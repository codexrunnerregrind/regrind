/**
 * Fixed palette for settings icon tiles. Deliberately independent of the
 * user's accent colour (see [data-accent] in layout.css): a settings list reads
 * as a map when each row keeps the same colour regardless of theme, and letting
 * eleven accents recolour every tile would turn the screen into one flat hue.
 *
 * Every tint pairs with white glyphs except `yellow`, which is light enough to
 * need dark ones — `tintForeground` encodes that.
 */
export const tints = {
	blue: "oklch(0.58 0.16 250)",
	indigo: "oklch(0.52 0.17 275)",
	purple: "oklch(0.55 0.18 305)",
	pink: "oklch(0.6 0.2 350)",
	red: "oklch(0.58 0.21 25)",
	orange: "oklch(0.65 0.17 50)",
	yellow: "oklch(0.82 0.15 92)",
	green: "oklch(0.6 0.13 160)",
	teal: "oklch(0.6 0.1 195)",
	slate: "oklch(0.52 0.03 250)",
} as const;

export type Tint = keyof typeof tints;

export function tintForeground(tint: Tint): string {
	return tint === "yellow" ? "oklch(0.24 0.02 90)" : "oklch(1 0 0)";
}
