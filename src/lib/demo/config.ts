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
	!("VITEST" in import.meta) && (demoOverride() ?? "PUBLIC_ENABLE_DEMO" in env);

/**
 * Flip demo mode and reload. Everything downstream reads `demoEnabled` once at
 * startup — transport, media URLs, the picker — so a reload is the only way to
 * hand the whole app over to (or back from) the mock backend.
 */
export function toggleDemoMode(): void {
	if (typeof localStorage === "undefined") return;
	localStorage.setItem(DEMO_STORAGE_KEY, String(!demoEnabled));
	location.reload();
}

export const demoMeProfileId = 123456000;

export const NOW = Date.now();
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const DEMO_PROFILE_COUNT = 3000;
export const DEMO_ID_START = demoMeProfileId + 1;
export const GRID_PAGE_SIZE = 60;
