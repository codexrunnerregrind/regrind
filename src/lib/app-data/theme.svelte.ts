import {
	getAccentColorSnapshot,
	getThemeModeSnapshot,
	type ThemeMode,
} from "./preferences.svelte";

let systemQuery: MediaQueryList | null = null;

function resolvesToDark(mode: ThemeMode): boolean {
	if (mode === "dark") return true;
	if (mode === "light") return false;
	return systemQuery?.matches ?? false;
}

function apply(mode: ThemeMode): void {
	const dark = resolvesToDark(mode);
	const root = document.documentElement;
	root.classList.toggle("dark", dark);
	root.style.colorScheme = dark ? "dark" : "light";
	root.dataset.accent = getAccentColorSnapshot();
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
