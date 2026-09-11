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
import { cacheNotificationImage } from "$lib/notifications/notification-image";
import { isAndroidPlatform, isIosPlatform } from "$lib/platform/os";
import { profileMediaUrl } from "$lib/util/media";
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

// A notification is a sentence about what someone did, not an inbox row's bare
// label. Mirrors TYPE_BODIES in PushNotifier.kt, which says the same for
// Android's pushes.
const TYPE_BODIES: Partial<Record<ApiResponseMessage["type"], string>> = {
	Album: "Shared an album with you",
	AlbumContentReaction: "Liked your album picture",
	AlbumContentReply: "Replied to your album picture",
	Audio: "Sent you a voice message",
	ExpiringAlbum: "Shared an expiring album with you",
	ExpiringAlbumV2: "Shared an expiring album with you",
	ExpiringImage: "Sent you an expiring picture",
	Gaymoji: "Sent you a gaymoji",
	Giphy: "Sent you a gif",
	Image: "Sent you a picture",
	Location: "Sent you their location",
	NonExpiringVideo: "Sent you a video",
	PrivateVideo: "Sent you a video",
	ProfileLink: "Sent you a profile",
	ProfilePhotoReply: "Replied to your profile picture",
	RightNowRequest: "Sent you a Right Now request",
	Unsent: "Unsent a message",
	Video: "Sent you a video",
	VideoCall: "Video called you",
};

const GENERIC_BODY = "Sent you a message";

function notificationBody(message: ApiResponseMessage): string {
	// Only a text message speaks for itself; everything else is named. A text
	// with nothing in it names itself too, rather than posting a blank banner.
	if (message.type === "Text")
		return message.body.text.trim() || GENERIC_BODY;
	return TYPE_BODIES[message.type] ?? GENERIC_BODY;
}

// The image to show inline on platforms that support attachments, or null. Uses
// the message's own picture; the sender's photo is the caller's fallback.
function messageImageUrl(message: ApiResponseMessage): string | null {
	if (message.type === "Image") return message.body.url;
	if (message.type === "Giphy") {
		const path = message.body.previewPath;
		return path.startsWith("http") ? path : null;
	}
	return null;
}

/**
 * OS-level notifications for incoming realtime events.
 *
 * These are *local* notifications surfaced from the same realtime WebSocket the
 * app already listens to, so they only fire while our process is running:
 * reliably on desktop (window backgrounded or unfocused) and during brief mobile
 * backgrounds, but not once the OS has fully suspended the webview. On Android
 * that gap is covered by real FCM push instead (see push.svelte.ts), so this
 * path is skipped there; desktop and iOS have no push channel and rely on it.
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

	/**
	 * Whether an event of this category should still become a banner. Permission
	 * is deliberately left to the caller: it can prompt, and nothing should
	 * prompt for a notification we are about to drop anyway (a muted chat).
	 */
	async #wantsNotification(
		kind: "notifyMessages" | "notifyTaps",
	): Promise<boolean> {
		if (this.#ourProfileId === null) return false;
		// Android delivers these through FCM (see push.svelte.ts), which fires
		// even once the OS suspends us; posting here too would double up.
		if (isAndroidPlatform()) return false;
		if (this.#appIsForeground()) return false;
		const prefs = await getPreferences().catch(() => null);
		return prefs?.[kind] === true;
	}

	async #onMessage(message: ApiResponseMessage): Promise<void> {
		if (message.senderId === this.#ourProfileId) return; // our own echo
		if (!(await this.#wantsNotification("notifyMessages"))) return;

		// Respect a muted conversation, but only if the chat store already exists —
		// never construct one here (that would kick off a network load).
		const entry = peekConversationsState()?.entries.find(
			(e) => e.data.conversationId === message.conversationId,
		);
		if (entry?.data.muted) return;

		if (!(await this.#ensurePermission())) return;

		const senderName = entry?.data.name?.trim();
		const sender = entry?.data.participants.find(
			(p) => p.profileId === message.senderId,
		);

		// iOS renders an attachment image; the desktop backend ignores it, so
		// only pay for the download there. Prefer the message's own picture,
		// falling back to the sender's photo.
		const attachments = isIosPlatform()
			? await this.#imageAttachment(message, sender?.primaryMediaHash)
			: undefined;

		sendNotification({
			title: senderName || "New message",
			body: notificationBody(message),
			group: message.conversationId,
			extra: { route: `/chat/${message.conversationId}` },
			attachments,
		});
	}

	async #imageAttachment(
		message: ApiResponseMessage,
		avatarMediaHash: string | null | undefined,
	): Promise<{ id: string; url: string }[] | undefined> {
		const source =
			messageImageUrl(message) ??
			(avatarMediaHash
				? profileMediaUrl({ mediaHash: avatarMediaHash, size: "thumb" })
				: null);
		if (!source) return undefined;
		const file = await cacheNotificationImage(
			source,
			message.conversationId,
		);
		return file ? [{ id: message.conversationId, url: file }] : undefined;
	}

	async #onTap(tap: {
		recipientId: number;
		senderId: number;
		senderDisplayName: string | null;
	}): Promise<void> {
		if (tap.recipientId !== this.#ourProfileId) return;
		if (!(await this.#wantsNotification("notifyTaps"))) return;
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
