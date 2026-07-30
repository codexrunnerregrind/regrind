import { type BubbleColor, surface } from "./palette";
import {
	getAccentColorSnapshot,
	getIncomingBubbleColorSnapshot,
	getOutgoingBubbleColorSnapshot,
	getThemeModeSnapshot,
	type ThemeMode,
} from "./preferences.svelte";

let systemQuery: MediaQueryList | null = null;

function resolvesToDark(mode: ThemeMode): boolean {
	if (mode === "dark") return true;
	if (mode === "light") return false;
	return systemQuery?.matches ?? false;
}

/**
 * Paints one bubble side. `neutral` clears the properties instead of setting
 * them, so the surface falls back to the themed grey defined in layout.css.
 */
function applyBubble(
	root: HTMLElement,
	side: "in" | "out",
	color: BubbleColor,
): void {
	const property = `--message-bubble-${side}`;
	const foreground =
		side === "out"
			? "--message-bubble-out-foreground"
			: "--message-bubble-foreground";
	if (color === "neutral") {
		root.style.removeProperty(property);
		root.style.removeProperty(foreground);
		return;
	}
	const { value, contrast } = surface(color);
	root.style.setProperty(property, value);
	root.style.setProperty(foreground, contrast);
}

function apply(mode: ThemeMode): void {
	const dark = resolvesToDark(mode);
	const root = document.documentElement;
	root.classList.toggle("dark", dark);
	root.style.colorScheme = dark ? "dark" : "light";

	// The attribute still gates the [data-accent] block in layout.css, which
	// derives --accent/--ring/--sidebar-*/--chart-1 from --primary; the two
	// properties below are what actually pick the colour.
	const accent = getAccentColorSnapshot();
	root.dataset.accent = accent;
	const { value, contrast } = surface(accent);
	root.style.setProperty("--primary", value);
	root.style.setProperty("--primary-foreground", contrast);

	applyBubble(root, "out", getOutgoingBubbleColorSnapshot());
	applyBubble(root, "in", getIncomingBubbleColorSnapshot());
}

/**
 * Keeps the document theme in sync with the user's preference and the OS
 * setting. Reads getThemeModeSnapshot() reactively, so it re-applies both when
 * preferences hydrate/change and when the system scheme flips (only relevant
 * while the mode is "system"). Call once, from the root layout. Returns a
 * cleanup function.
 */
export function initTheme(): () => void {
	systemQuery = window.matchMedia("(prefers-color-scheme: dark)");
	const onSystemChange = () => apply(getThemeModeSnapshot());
	systemQuery.addEventListener("change", onSystemChange);

	const stop = $effect.root(() => {
		$effect(() => {
			apply(getThemeModeSnapshot());
		});
	});

	return () => {
		systemQuery?.removeEventListener("change", onSystemChange);
		systemQuery = null;
		stop();
	};
}
