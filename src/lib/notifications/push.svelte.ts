import { goto } from "$app/navigation";
import z from "zod";

import { fetchRest } from "$lib/api/transport";
import { preferencesSnapshot } from "$lib/app-data/preferences.svelte";
import { isAndroidPlatform } from "$lib/platform/os";
import { whileOpeningPushDeeplink } from "$lib/push/opening-deeplink";

// Android-only Firebase Cloud Messaging registration. The native side (see
// org.regrind.push) registers with Grindr's FCM sender and hands us the device
// token through the `regrind:fcm-token` event / `window.__REGRIND_FCM_TOKEN`.
// We forward it to Grindr so its backend pushes to us even once the OS has
// suspended the webview — the reliability the WebSocket-driven local
// notifications can't offer. Desktop and iOS have no FCM channel and keep using
// the local notifications in notifications.svelte.ts.

const SYNCED_KEY = "regrind:push-token-synced";
const TOKEN_KEY = "regrind:fcm-token";

// A registration that silently lapsed is indistinguishable from a working one
// until a message fails to arrive, so re-post the token when the record of the
// last sync gets old rather than trusting it forever.
const RESYNC_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
// Backoff for a failed sync while the app stays open. Without it a single
// offline moment at sign-in cost push until the next launch.
const RETRY_DELAYS_MS = [5_000, 20_000, 60_000, 300_000];

const syncRecordSchema = z.object({ marker: z.string(), at: z.number() });

/** Whether this device is registered for push, for the settings screen to show. */
export type PushRegistration = "idle" | "syncing" | "registered" | "failed";

// The native side persists the token here as well as firing the event, so a
// token that arrived before sign-in is not lost.
function storedToken(): string | null {
	try {
		return localStorage.getItem(TOKEN_KEY);
	} catch {
		return null;
	}
}

// Keyed by token *and* account: the device token is stable across account
// switches but the backend association is per-account, so a stale marker from
// another account must not skip the re-sync. The timestamp is what expires it.
function syncedRecently(marker: string): boolean {
	try {
		const raw = localStorage.getItem(SYNCED_KEY);
		if (!raw) return false;
		// A `safeParse` failure covers the pre-timestamp format too: re-post
		// once and store the record the new way.
		const record = syncRecordSchema.safeParse(JSON.parse(raw));
		if (!record.success || record.data.marker !== marker) return false;
		return Date.now() - record.data.at < RESYNC_AFTER_MS;
	} catch {
		return false;
	}
}

async function syncToken(token: string, profileId: number): Promise<boolean> {
	const trimmed = token.trim();
	if (!trimmed) return false;

	const marker = `${trimmed}::${profileId}`;
	if (syncedRecently(marker)) return true;

	const identifier = trimmed.split(":")[0] || trimmed;
	const res = await fetchRest("/v3/gcm-push-tokens", {
		method: "POST",
		body: { vendorProvidedIdentifier: identifier, token: trimmed },
	});
	res.assertOk();
	try {
		localStorage.setItem(
			SYNCED_KEY,
			JSON.stringify({ marker, at: Date.now() }),
		);
	} catch {
		// A lost marker only costs a redundant POST next time.
	}
	return true;
}

class PushService {
	#profileId: number | null = null;
	#stopPrefs: (() => void) | null = null;
	#onToken: ((event: Event) => void) | null = null;
	#onOpen: ((event: Event) => void) | null = null;
	#onTokenError: ((event: Event) => void) | null = null;
	#onVisible: (() => void) | null = null;
	#retryTimer: ReturnType<typeof setTimeout> | null = null;
	#attempt = 0;
	#token: string | null = null;
	#registration = $state<PushRegistration>("idle");

	/** Reactive: whether Grindr has this device's push token. */
	get registration(): PushRegistration {
		return this.#registration;
	}

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
				const prefs = preferencesSnapshot();
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

		this.#onTokenError = (event: Event) => {
			const reason = (event as CustomEvent<{ reason?: string }>).detail
				?.reason;
			this.#unavailable(reason ?? "no push token");
		};
		window.addEventListener("regrind:fcm-token-error", this.#onTokenError);

		this.#onOpen = (event: Event) => {
			const route = (event as CustomEvent<{ route?: string }>).detail
				?.route;
			if (route) void whileOpeningPushDeeplink(() => goto(route));
		};
		window.addEventListener("regrind:push-open", this.#onOpen);

		// Coming back to the app is the cheapest moment to notice a sync that
		// never landed, and the one where the network is most likely back.
		this.#onVisible = () => {
			if (document.visibilityState !== "visible") return;
			if (this.#registration === "syncing") return;
			void this.#trySync(this.#token ?? storedToken() ?? "");
		};
		document.addEventListener("visibilitychange", this.#onVisible);

		// A tap that cold-started the app fires the event before this listener
		// exists, so native leaves the route here as well. Consume it once.
		const opened = window.__REGRIND_PUSH_ROUTE;
		if (opened) {
			window.__REGRIND_PUSH_ROUTE = undefined;
			void whileOpeningPushDeeplink(() => goto(opened));
		}

		// A token captured before this profile signed in is stashed on the
		// window and in localStorage; pick it up now rather than waiting for
		// the next refresh.
		const known = window.__REGRIND_FCM_TOKEN ?? storedToken();
		if (known) void this.#trySync(known);
		// A fetch that failed before sign-in is the reason there is no token to
		// pick up, so it has to be consulted after it.
		else if (window.__REGRIND_FCM_UNAVAILABLE)
			this.#unavailable(window.__REGRIND_FCM_UNAVAILABLE);
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
		if (this.#onTokenError) {
			window.removeEventListener(
				"regrind:fcm-token-error",
				this.#onTokenError,
			);
			this.#onTokenError = null;
		}
		if (this.#onVisible) {
			document.removeEventListener("visibilitychange", this.#onVisible);
			this.#onVisible = null;
		}
		this.#clearRetry();
		this.#stopPrefs?.();
		this.#stopPrefs = null;
		this.#profileId = null;
		this.#token = null;
		this.#attempt = 0;
		this.#registration = "idle";
	}

	/** Re-run a failed registration now, from the settings screen. */
	async retry(): Promise<void> {
		this.#attempt = 0;
		const token = this.#token ?? storedToken();
		if (token) {
			await this.#trySync(token);
			return;
		}
		// Nothing to sync: the failure was native, so the token itself is what
		// has to be asked for again. Native answers through the token or the
		// error event; with no one to ask, the failure stands rather than
		// leaving the screen waiting on an answer that cannot arrive.
		const bridge = window.__RegrindPush;
		if (!bridge?.refreshToken) {
			this.#registration = "failed";
			return;
		}
		this.#registration = "syncing";
		bridge.refreshToken();
	}

	// A native failure means there is no token to post at all. Reported the
	// same way a failed POST is, because it costs the user the same thing.
	#unavailable(reason: string): void {
		if (this.#profileId === null) return;
		console.error("[push] no FCM token:", reason);
		this.#clearRetry();
		this.#token = null;
		this.#registration = "failed";
	}

	async #trySync(token: string): Promise<void> {
		const profileId = this.#profileId;
		if (profileId === null) return;
		if (!token) return;
		this.#token = token;
		this.#clearRetry();
		this.#registration = "syncing";
		try {
			await syncToken(token, profileId);
			this.#attempt = 0;
			this.#registration = "registered";
		} catch (error) {
			console.error("[push] failed to sync FCM token", error);
			this.#registration = "failed";
			this.#scheduleRetry();
		}
	}

	// Backoff rather than a fixed interval: the common failure is a few seconds
	// of no network at sign-in, and the rare one should not poll all day.
	#scheduleRetry(): void {
		const delay = RETRY_DELAYS_MS[this.#attempt];
		if (delay === undefined) return;
		this.#attempt += 1;
		this.#retryTimer = setTimeout(() => {
			this.#retryTimer = null;
			const token = this.#token;
			if (token) void this.#trySync(token);
		}, delay);
	}

	#clearRetry(): void {
		if (this.#retryTimer === null) return;
		clearTimeout(this.#retryTimer);
		this.#retryTimer = null;
	}

	/** Tell native which screen is showing so it can suppress redundant banners. */
	setActiveRoute(route: string): void {
		if (!isAndroidPlatform()) return;
		window.__RegrindPush?.setActiveRoute(route);
	}
}

export const push = new PushService();
