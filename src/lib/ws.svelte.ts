import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import z from "zod";

import { tapTypeOrNoneSchema } from "$lib/model/interest/taps";
import { mediaHashPublicSchema } from "$lib/model/media";
import { apiResponseMessageSchema } from "$lib/model/messaging/messages";
import { unixTimestampMsSchema } from "$lib/model/types";

export const notificationEventSchema = z.object({
	type: z.string(),
	notificationId: z.string().nullable(),
	ref: z.string().nullable(),
	payload: z.unknown(),
});

export const chatV1MessageSentEventSchema = notificationEventSchema.safeExtend({
	type: z.literal("chat.v1.message_sent"),
	payload: apiResponseMessageSchema,
});

export const chatV1ConversationDeleteEventSchema =
	notificationEventSchema.safeExtend({
		type: z.literal("chat.v1.conversation.delete"),
		payload: z.object({ conversationIds: z.array(z.string()) }),
	});

export const chatV1ConversationReadEventSchema =
	notificationEventSchema.safeExtend({
		type: z.literal("chat.v1.conversation_read"),
		payload: z.object({
			conversationId: z.string(),
			profileId: z.coerce.number(),
			timestamp: unixTimestampMsSchema,
		}),
	});

export const tapV1TapSentEventSchema = notificationEventSchema.safeExtend({
	type: z.literal("tap.v1.tap_sent"),
	payload: z.object({
		timestamp: unixTimestampMsSchema,
		senderId: z.number(),
		recipientId: z.number(),
		tapType: tapTypeOrNoneSchema.nullable(),
		senderProfileImageHash: mediaHashPublicSchema.nullable(),
		senderDisplayName: z.string().nullable(),
		isMutual: z.boolean(),
	}),
});

export const viewedMeV1NewViewReceivedEventSchema =
	notificationEventSchema.safeExtend({
		type: z.literal("viewed_me.v1.new_view_received"),
		payload: z.object({
			viewedCount: z.int().nullable(),
			mostRecent: z
				.object({
					profileId: z.coerce.number().int().nonnegative(),
					photoHash: z.string().nullish(),
					timestamp: unixTimestampMsSchema,
				})
				.nullable(),
		}),
	});

export type ChatV1MessageSentEventPayload = z.infer<
	typeof chatV1MessageSentEventSchema
>;
export type TapV1TapSentEventPayload = z.infer<typeof tapV1TapSentEventSchema>;
export type ViewedMeV1NewViewReceivedEventPayload = z.infer<
	typeof viewedMeV1NewViewReceivedEventSchema
>;
export type ChatV1ConversationDeleteEventPayload = z.infer<
	typeof chatV1ConversationDeleteEventSchema
>;
export type ChatV1ConversationReadEventPayload = z.infer<
	typeof chatV1ConversationReadEventSchema
>;

export type WsStatus = "disconnected" | "connected";

// A hidden window shorter than this (opening the OS share sheet, a permission
// prompt, a quick app switch) leaves the socket healthy, so we skip the liveness
// poke on resume. Longer means the OS likely suspended us and the connection may
// have died silently.
const RESUME_POKE_THRESHOLD_MS = 3000;

class WsState {
	status = $state<WsStatus>("disconnected");
	#hiddenSince: number | undefined;

	constructor() {
		listen<void>("ws:connected", () => {
			this.status = "connected";
			console.log("[ws] connected");
		}).catch(console.error);

		listen<void>("ws:disconnected", () => {
			this.status = "disconnected";
		}).catch(console.error);

		this.#registerLifecycle();
	}

	connect(): void {
		console.log("[ws] connecting...");
		invoke("ws_connect").catch((e: unknown) => {
			console.error("[ws] connect failed", e);
		});
	}

	// When iOS/Android suspends the app in the background, the realtime socket is
	// often dropped by the carrier/NAT/server without a FIN reaching our frozen
	// process. On resume, the Rust side is still `await`ing a read that will never
	// complete: the app looks connected but receives nothing, and the only cure
	// used to be force-quitting. The backend auto-reconnects when the socket
	// *errors*, but never notices a silently half-open one on its own.
	//
	// We can't tell the backend to drop the socket from here, but sending any
	// command makes its send loop attempt a write. On a dead socket that write
	// fails, which is exactly the error the reconnect logic waits for; on a
	// healthy socket it's a cheap no-op the server ignores. So on real resume we
	// (idempotently) ensure the task is up and poke the socket to prove it.
	#registerLifecycle(): void {
		if (typeof document === "undefined") return;

		const onVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				const hiddenMs =
					this.#hiddenSince === undefined
						? Number.POSITIVE_INFINITY
						: Date.now() - this.#hiddenSince;
				this.#hiddenSince = undefined;
				this.resume(hiddenMs >= RESUME_POKE_THRESHOLD_MS);
			} else {
				this.#hiddenSince = Date.now();
			}
		};

		document.addEventListener("visibilitychange", onVisibilityChange);
		// Regaining network (e.g. Wi-Fi/cellular handoff) can also strand a stale
		// socket; force a liveness check when it comes back.
		window.addEventListener("online", () => this.resume(true));
	}

	// Bring the realtime socket back after the app was backgrounded. `poke`
	// forces a liveness write (see #registerLifecycle); pass false for brief
	// hides where the socket is still healthy.
	resume(poke = true): void {
		this.connect();
		if (poke) this.#poke();
	}

	// Liveness write. We don't care about the response — the point is that the
	// backend's send loop attempts a socket write, which fails fast on a dead
	// connection and triggers its reconnect.
	#poke(): void {
		invoke("ws_send", {
			command: {
				type: "keepalive",
				ref_id: crypto.randomUUID(),
				payload: {},
			},
		}).catch(() => {
			// The command channel only errors if the client is gone; connect()
			// above will have re-armed the task, so there's nothing to do here.
		});
	}

	onConnected(handler: () => void): Promise<() => void> {
		return listen<void>("ws:connected", () => handler());
	}

	onEventsDropped(handler: (skipped: number) => void): Promise<() => void> {
		return listen<number>("ws:events-dropped", (event) => {
			handler(event.payload);
		});
	}

	send(type: string, payload: unknown): void {
		const ref_id = crypto.randomUUID();
		invoke("ws_send", { command: { type, ref_id, payload } }).catch(
			(e: unknown) => {
				console.error("[ws] send failed", type, e);
			},
		);
	}

	sendCommand<T>(
		type: string,
		payload: unknown,
		responseSchema: z.ZodType<T>,
		{ timeoutMs = 10000 }: { timeoutMs?: number } = {},
	): Promise<T> {
		const ref_id = crypto.randomUUID();
		const safeName = `${type}.response`.replaceAll(".", "_");

		return new Promise<T>((resolve, reject) => {
			let unlisten: (() => void) | undefined;
			let settled = false;
			const settle = (run: () => void) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				unlisten?.();
				run();
			};
			const timeout = setTimeout(
				() =>
					settle(() =>
						reject(new Error(`[ws] command timed out: ${type}`)),
					),
				timeoutMs,
			);
			const onError = (e: unknown) =>
				settle(() =>
					reject(e instanceof Error ? e : new Error(String(e))),
				);

			listen<{ ref: string; status: number; payload: unknown }>(
				`grindr:${safeName}`,
				(event) => {
					if (event.payload.ref !== ref_id) return;
					settle(() => {
						if (event.payload.status >= 400) {
							reject(
								new Error(
									`[ws] command failed: ${type} (${event.payload.status})`,
								),
							);
							return;
						}
						const result = responseSchema.safeParse(
							event.payload.payload,
						);
						if (result.success) resolve(result.data);
						else reject(result.error);
					});
				},
			)
				.then((fn) => (settled ? fn() : (unlisten = fn)))
				.catch(onError);

			invoke("ws_send", { command: { type, ref_id, payload } }).catch(
				onError,
			);
		});
	}

	on<T>(
		eventType: string,
		schema: z.ZodType<T>,
		handler: (payload: T) => void,
	): Promise<() => void> {
		const safeName = eventType.replaceAll(".", "_");
		return listen<unknown>(`grindr:${safeName}`, (event) => {
			const result = schema.safeParse(event.payload);
			if (result.success) {
				handler(result.data);
			} else {
				console.error(
					`[ws] unexpected payload for ${eventType}:`,
					result.error,
					event.payload,
				);
			}
		});
	}
}

export const ws = new WsState();
