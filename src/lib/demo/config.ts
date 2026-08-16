import { env } from "$env/dynamic/public";

// The build-time env var is the default; the hidden toggle in Settings (tap the
// app version seven times) overrides it and wins in both directions, so a demo
// build can be switched back to the real API and vice versa.
const DEMO_STORAGE_KEY = "demo:enabled";

function demoOverride(): boolean | undefined {
	if (typeof localStorage === "undefined") return undefined;
	const stored = localStorage.getItem(DEMO_STORAGE_KEY);
	return stored === null ? undefined : stored === "true";
}

export const demoEnabled =
	!("VITEST" in import.meta) &&
	(demoOverride() ?? "PUBLIC_ENABLE_DEMO" in env);

/**
 * Flip demo mode and reload. Everything downstream reads `demoEnabled` once at
 * startup — transport, media URLs, the picker — so a reload is the only way to
 * hand the whole app over to (or back from) the mock backend.
 */
export function toggleDemoMode(): void {
	if (typeof localStorage === "undefined") return;
	localStorage.setItem(DEMO_STORAGE_KEY, String(!demoEnabled));
	sessionStorage.setItem(DEMO_ANNOUNCE_KEY, String(!demoEnabled));
	location.reload();
}

const DEMO_ANNOUNCE_KEY = "demo:announce";

/**
 * The state demo mode was just toggled into, if this load is the reload
 * `toggleDemoMode` triggered. Reading it clears it, so the announcement shows
 * once. The toast has to wait for the reload — a toast fired before it would be
 * torn down with the page, and it would sit on top of the version string in the
 * middle of the tap gesture.
 */
export function takeDemoAnnouncement(): boolean | undefined {
	if (typeof sessionStorage === "undefined") return undefined;
	const stored = sessionStorage.getItem(DEMO_ANNOUNCE_KEY);
	if (stored === null) return undefined;
	sessionStorage.removeItem(DEMO_ANNOUNCE_KEY);
	return stored === "true";
}

export const demoMeProfileId = 123456000;

export const NOW = Date.now();
export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const DEMO_PROFILE_COUNT = 3000;
export const DEMO_ID_START = demoMeProfileId + 1;
export const GRID_PAGE_SIZE = 60;
