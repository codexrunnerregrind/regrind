import { goto } from "$app/navigation";

import { fetchRest } from "$lib/api/transport";
import { getPreferencesSnapshot } from "$lib/app-data/preferences.svelte";
import { isAndroidPlatform } from "$lib/platform/os";

// Android-only Firebase Cloud Messaging registration. The native side (see
// org.regrind.push) registers with Grindr's FCM sender and hands us the device
// token through the `regrind:fcm-token` event / `window.__REGRIND_FCM_TOKEN`.
// We forward it to Grindr so its backend pushes to us even once the OS has
// suspended the webview — the reliability the WebSocket-driven local
// notifications can't offer. Desktop and iOS have no FCM channel and keep using
// the local notifications in notifications.svelte.ts.

const SYNCED_KEY = "regrind:push-token-synced";
const TOKEN_KEY = "regrind:fcm-token";

// The native side persists the token here as well as firing the event, so a
// token that arrived before sign-in is not lost.
function storedToken(): string | null {
	try {
		return localStorage.getItem(TOKEN_KEY);
	} catch {
		return null;
	}
}

async function syncToken(token: string, profileId: number): Promise<void> {
	const trimmed = token.trim();
	if (!trimmed) return;

	// Keyed by token *and* account: the device token is stable across account
	// switches but the backend association is per-account, so a stale marker
	// from another account must not skip the re-sync.
	const marker = `${trimmed}::${profileId}`;
	if (localStorage.getItem(SYNCED_KEY) === marker) return;

	const identifier = trimmed.split(":")[0] || trimmed;
	const res = await fetchRest("/v3/gcm-push-tokens", {
		method: "POST",
		body: { vendorProvidedIdentifier: identifier, token: trimmed },
	});
	res.assertOk();
	localStorage.setItem(SYNCED_KEY, marker);
}

class PushService {
	#profileId: number | null = null;
	#stopPrefs: (() => void) | null = null;
	#onToken: ((event: Event) => void) | null = null;
	#onOpen: ((event: Event) => void) | null = null;

	/** Register FCM sync + deeplink handling for the signed-in profile. */
	start(profileId: number): void {
		if (!isAndroidPlatform()) return;
		if (this.#profileId === profileId) return;
		if (this.#profileId !== null) this.stop();
		this.#profileId = profileId;

		// Keep the native suppression flags in step with the user's prefs so a
		// backgrounded push respects a disabled category.
		this.#stopPrefs = $effect.root(() => {
			$effect(() => {
				const prefs = getPreferencesSnapshot();
				window.__RegrindPush?.setPrefs(
					prefs.notifyMessages,
					prefs.notifyTaps,
				);
			});
		});

		this.#onToken = (event: Event) => {
			const token = (event as CustomEvent<{ token?: string }>).detail
				?.token;
			if (token) void this.#trySync(token);
		};
		window.addEventListener("regrind:fcm-token", this.#onToken);

		this.#onOpen = (event: Event) => {
			const route = (event as CustomEvent<{ route?: string }>).detail
				?.route;
			if (route) void goto(route);
		};
		window.addEventListener("regrind:push-open", this.#onOpen);

		// A token captured before this profile signed in is stashed on the
		// window and in localStorage; pick it up now rather than waiting for
		// the next refresh.
		const known = window.__REGRIND_FCM_TOKEN ?? storedToken();
		if (known) void this.#trySync(known);
	}

	stop(): void {
		if (this.#onToken) {
			window.removeEventListener("regrind:fcm-token", this.#onToken);
			this.#onToken = null;
		}
		if (this.#onOpen) {
			window.removeEventListener("regrind:push-open", this.#onOpen);
			this.#onOpen = null;
		}
		this.#stopPrefs?.();
		this.#stopPrefs = null;
		this.#profileId = null;
	}

	async #trySync(token: string): Promise<void> {
		const profileId = this.#profileId;
		if (profileId === null) return;
		try {
			await syncToken(token, profileId);
		} catch (error) {
			console.error("[push] failed to sync FCM token", error);
		}
	}

	/** Tell native which screen is showing so it can suppress redundant banners. */
	setActiveRoute(route: string): void {
		if (!isAndroidPlatform()) return;
		window.__RegrindPush?.setActiveRoute(route);
	}
}

export const push = new PushService();
