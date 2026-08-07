import {
	isPermissionGranted,
	onAction,
	requestPermission,
	sendNotification,
} from "@tauri-apps/plugin-notification";
import { goto } from "$app/navigation";
import z from "zod";

import { getPreferences } from "$lib/app-data/preferences.svelte";
import { peekConversationsState } from "$lib/chat/conversations-context.svelte";
import {
	previewFromMessage,
	previewLabel,
} from "$lib/model/messaging/messages";
import {
	chatV1MessageSentEventSchema,
	tapV1TapSentEventSchema,
	ws,
} from "$lib/ws.svelte";
import type { ApiResponseMessage } from "$lib/model/messaging/messages";

type PermissionState = "unknown" | "granted" | "denied" | "default";

// `extra` survives the round-trip through the OS and comes back on tap, so we
// stash the in-app route to open there.
const notificationExtraSchema = z.object({ route: z.string().optional() });

/**
 * OS-level notifications for incoming realtime events.
 *
 * This is an unofficial client with no backend of its own, so there is no APNs/FCM
 * push channel to hook into. Instead we surface *local* notifications from the same
 * realtime WebSocket the app already listens to. That means notifications only fire
 * while our process is still running: reliably on desktop (window backgrounded or
 * unfocused) and during brief mobile backgrounds, but not once the OS has fully
 * suspended the webview. That is the best achievable without a push server.
 *
 * We only notify when the app is *not* in the foreground — when it is, the in-app
 * incoming-message toast already covers the message case and an OS banner would be
 * redundant noise.
 */
class NotificationService {
	#ourProfileId: number | null = null;
	#started = false;
	#unlisteners: Promise<() => void>[] = [];
	#permission: PermissionState = "unknown";

	/** Register realtime listeners for the signed-in profile. Idempotent. */
	async start(ourProfileId: number): Promise<void> {
		if (this.#started && this.#ourProfileId === ourProfileId) return;
		// Account switch: tear down the previous profile's listeners first.
		if (this.#started) await this.stop();

		this.#started = true;
		this.#ourProfileId = ourProfileId;

		// Any of these can reject when the Tauri runtime is absent (e.g. running in
		// a plain browser); normalise every entry to a safe unlisten so teardown
		// never throws.
		const safe = (p: Promise<() => void>): Promise<() => void> =>
			p.catch((error: unknown) => {
				console.error(
					"[notifications] listener registration failed",
					error,
				);
				return () => {};
			});

		this.#unlisteners.push(
			safe(
				ws.on(
					"chat.v1.message_sent",
					chatV1MessageSentEventSchema,
					(event) => {
						void this.#onMessage(event.payload);
					},
				),
			),
			safe(
				ws.on("tap.v1.tap_sent", tapV1TapSentEventSchema, (event) => {
					void this.#onTap(event.payload);
				}),
			),
			// Tapping a notification (or its action) foregrounds the app and fires
			// this; open the route we stashed in `extra`.
			safe(
				onAction((notification) => {
					const route = notificationExtraSchema.safeParse(
						notification.extra,
					).data?.route;
					if (route) void goto(route);
				}).then((listener) => () => void listener.unregister()),
			),
		);

		// Warm up permission on launch so the first real event can notify without a
		// prompt racing the banner. Only if the user actually wants notifications.
		const prefs = await getPreferences().catch(() => null);
		if (prefs && (prefs.notifyMessages || prefs.notifyTaps)) {
			void this.#ensurePermission();
		}
	}

	async stop(): Promise<void> {
		this.#started = false;
		this.#ourProfileId = null;
		const unlisteners = await Promise.all(this.#unlisteners);
		for (const unlisten of unlisteners) unlisten();
		this.#unlisteners = [];
	}

	/**
	 * Ask the OS for notification permission, requesting it if not yet decided.
	 * Exposed so the settings toggle can trigger the prompt on a user gesture.
	 * Returns whether notifications are currently allowed.
	 */
	async ensurePermission(): Promise<boolean> {
		return this.#ensurePermission();
	}

	async #ensurePermission(): Promise<boolean> {
		if (this.#permission === "granted") return true;
		try {
			if (await isPermissionGranted()) {
				this.#permission = "granted";
				return true;
			}
			const result = await requestPermission();
			this.#permission = result;
			return result === "granted";
		} catch (error) {
			console.error("[notifications] permission check failed", error);
			return false;
		}
	}

	#appIsForeground(): boolean {
		if (typeof document === "undefined") return true;
		return document.visibilityState === "visible" && document.hasFocus();
	}

	async #onMessage(message: ApiResponseMessage): Promise<void> {
		if (this.#ourProfileId === null) return;
		if (message.senderId === this.#ourProfileId) return; // our own echo
		if (this.#appIsForeground()) return;

		const prefs = await getPreferences().catch(() => null);
		if (!prefs?.notifyMessages) return;

		// Respect a muted conversation, but only if the chat store already exists —
		// never construct one here (that would kick off a network load).
		const entry = peekConversationsState()?.entries.find(
			(e) => e.data.conversationId === message.conversationId,
		);
		if (entry?.data.muted) return;

		if (!(await this.#ensurePermission())) return;

		const senderName = entry?.data.name?.trim();
		sendNotification({
			title: senderName || "New message",
			body:
				previewLabel(previewFromMessage(message)) ??
				"Sent you a message",
			group: message.conversationId,
			extra: { route: `/chat/${message.conversationId}` },
		});
	}

	async #onTap(tap: {
		recipientId: number;
		senderId: number;
		senderDisplayName: string | null;
	}): Promise<void> {
		if (this.#ourProfileId === null) return;
		if (tap.recipientId !== this.#ourProfileId) return;
		if (this.#appIsForeground()) return;

		const prefs = await getPreferences().catch(() => null);
		if (!prefs?.notifyTaps) return;

		if (!(await this.#ensurePermission())) return;

		const name = tap.senderDisplayName?.trim();
		sendNotification({
			title: "New tap",
			body: name ? `${name} tapped you` : "Someone tapped you",
			group: `tap:${tap.senderId}`,
			extra: { route: "/interest/taps" },
		});
	}
}

export const notifications = new NotificationService();
