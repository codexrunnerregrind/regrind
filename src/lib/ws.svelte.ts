import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import z from "zod";

import { ApiError } from "$lib/api/api-error";
import { asAppError } from "$lib/api/methods";
import { tapTypeOrNoneSchema } from "$lib/model/interest/taps";
import { mediaHashPublicSchema } from "$lib/model/media";
import { apiResponseMessageSchema } from "$lib/model/messaging/messages";
import { knownValueOrNull } from "$lib/model/tolerance";
import { unixTimestampMsSchema, unmodeledSchema } from "$lib/model/types";

export const notificationEventSchema = z.object({
	type: z.string(),
	notificationId: z.string().nullish(),
	ref: z.string().nullish(),
	payload: unmodeledSchema,
});

// The server answers a command on `<type>.response`, echoing our `ref` and
// carrying an HTTP-shaped status the official client also treats as nullable.
export const commandResponseEventSchema = notificationEventSchema.safeExtend({
	status: z.int().nullish(),
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

export const chatV1ConversationUpdateEventSchema =
	notificationEventSchema.safeExtend({
		type: z.literal("chat.v1.conversation.update"),
		payload: z.object({ conversationIds: z.array(z.string()) }),
	});

/**
 * A share, unshare, expiry change or view on an album already sent to a
 * conversation. The message itself never changes, so only a refetch of the
 * conversation can tell the album bubble what it now says.
 */
export const chatV1RefreshDynamicEventSchema =
	notificationEventSchema.safeExtend({
		type: z.literal("chat.v1.refresh_dynamic"),
		payload: z.object({
			conversationId: z.string(),
			messageType: z.string().nullish(),
		}),
	});

export const TYPING_STATUSES = ["Typing", "Cleared", "Sent"] as const;
export type TypingStatus = (typeof TYPING_STATUSES)[number];

export const chatV1TypingStatusEventSchema = notificationEventSchema.safeExtend(
	{
		type: z.literal("chat.v1.typing_status"),
		payload: z.object({
			conversationId: z.string(),
			profileId: z.coerce.number(),
			status: z.enum(TYPING_STATUSES),
		}),
	},
);

/**
 * A hard delete of a message, as opposed to the unsend that arrives as a
 * `chat.v1.message_sent` carrying `unsent`. The payload is undocumented, so we
 * read whichever of the ids it turns out to carry and fall back to refetching
 * the conversation when it carries none we recognise.
 */
export const chatV1MessageDeletedEventSchema =
	notificationEventSchema.safeExtend({
		type: z.literal("chat.v1.message_deleted"),
		payload: z.looseObject({
			conversationId: z.string().nullish(),
			conversationIds: z.array(z.string()).nullish(),
			messageId: z.string().nullish(),
			messageIds: z.array(z.string()).nullish(),
		}),
	});

/** Undocumented payload; the type alone is the signal to refresh the inbox. */
export const chatV1CacheBombInboxEventSchema =
	notificationEventSchema.safeExtend({
		type: z.literal("chat.v1.cache_bomb.inbox"),
	});

/**
 * The server telling us it holds events it could not deliver — so our local
 * state may be missing anything, not just messages. Undocumented payload.
 */
export const notificationUndeliveredEventSchema =
	notificationEventSchema.safeExtend({
		type: z.literal("notification.undelivered"),
	});

export const tapV1TapSentEventSchema = notificationEventSchema.safeExtend({
	type: z.literal(["tap.v1.tap_sent", "tap.v2.tap_sent"]),
	payload: z.object({
		timestamp: unixTimestampMsSchema,
		senderId: z.number(),
		recipientId: z.number(),
		tapType: knownValueOrNull({
			value: tapTypeOrNoneSchema,
			label: "tap event tapType",
		}),
		senderProfileImageHash: mediaHashPublicSchema.nullable(),
		senderDisplayName: z.string().nullable(),
		isMutual: z.boolean(),
	}),
});

/**
 * Someone is calling us. The only signal that a call exists: there is no REST
 * endpoint to poll for one, and nothing else says who is ringing.
 */
export const videocallV1IncomingCallEventSchema =
	notificationEventSchema.safeExtend({
		type: z.literal("videocall.v1.incoming_call"),
		payload: z.looseObject({
			channelId: z.string(),
			senderId: z.coerce.number().int().nonnegative(),
		}),
	});

/**
 * A call is over, whichever side ended it and whether or not it ever
 * connected. `result` is the outcome (`SUCCESSFUL`, `DECLINED`, `UNANSWERED`,
 * `TARGET_PROFILE_UNAVAILABLE`), and it is the caller's only word on whether
 * the other side ever picked up.
 */
export const videocallV1CallEndedEventSchema =
	notificationEventSchema.safeExtend({
		type: z.literal("videocall.v1.call_ended"),
		payload: z.looseObject({
			channelId: z.string(),
			senderId: z.coerce.number().int().nonnegative().nullish(),
			recipientId: z.coerce.number().int().nonnegative().nullish(),
			result: z.string().nullish(),
			duration: z.coerce.number().nullish(),
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
export type ChatV1ConversationUpdateEventPayload = z.infer<
	typeof chatV1ConversationUpdateEventSchema
>;
export type ChatV1RefreshDynamicEventPayload = z.infer<
	typeof chatV1RefreshDynamicEventSchema
>;
export type ChatV1TypingStatusEventPayload = z.infer<
	typeof chatV1TypingStatusEventSchema
>;
export type ChatV1MessageDeletedEventPayload = z.infer<
	typeof chatV1MessageDeletedEventSchema
>;
export type VideocallV1IncomingCallEventPayload = z.infer<
	typeof videocallV1IncomingCallEventSchema
>;
export type VideocallV1CallEndedEventPayload = z.infer<
	typeof videocallV1CallEndedEventSchema
>;

export type WsStatus = "disconnected" | "connected";

// A hidden window shorter than this (opening the OS share sheet, a permission
// prompt, a quick app switch) leaves the socket healthy, so we skip the liveness
// poke on resume. Longer means the OS likely suspended us and the connection may
// have died silently.
const RESUME_POKE_THRESHOLD_MS = 3000;

function errorBody(payload: unknown): string {
	return payload === undefined || payload === null
		? ""
		: JSON.stringify(payload);
}

class WsState {
	status = $state<WsStatus>("disconnected");
	#hiddenSince: number | undefined;
	#rejectedHandlers = new Set<(eventType: string) => void>();

	constructor() {
		listen<void>("ws:connected", () => {
			this.status = "connected";
		}).catch((error) => console.error(error));

		listen<void>("ws:disconnected", () => {
			this.status = "disconnected";
		}).catch((error) => console.error(error));

		this.#registerLifecycle();
	}

	connect(): void {
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
		invoke("ws_send", {
			command: { type, ref_id: crypto.randomUUID(), payload },
		}).catch((e: unknown) => {
			console.error("[ws] send failed", type, e);
		});
	}

	sendCommand<T>({
		type,
		payload,
		responseSchema,
		timeoutMs = 10_000,
	}: {
		type: string;
		payload: unknown;
		responseSchema: z.ZodType<T>;
		timeoutMs?: number;
	}): Promise<T> {
		const ref_id = crypto.randomUUID();

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
						reject(
							new ApiError({
								message: `websocket command ${type} timed out`,
								request: { method: "WS", path: type },
							}),
						),
					),
				timeoutMs,
			);

			const request = { method: "WS", path: type, body: payload };
			const failed = (error: unknown) =>
				settle(() =>
					reject(
						error instanceof ApiError
							? error
							: new ApiError({
									message:
										asAppError(error)?.prettyMessage ??
										(error instanceof Error
											? error.message
											: String(error)),
									request,
									kind: asAppError(error)?.kind ?? null,
									cause: error,
								}),
					),
				);

			this.on(
				`${type}.response`,
				commandResponseEventSchema,
				(response) => {
					if (response.ref !== ref_id) return;
					settle(() => {
						const status = response.status ?? 0;
						if (status >= 400) {
							reject(
								new ApiError({
									message: `websocket command ${type} failed`,
									request,
									response: {
										status,
										body: errorBody(response.payload),
									},
								}),
							);
							return;
						}
						const result = responseSchema.safeParse(
							response.payload,
						);
						if (result.success) {
							resolve(result.data);
							return;
						}
						console.error(
							`[ws] unexpected ${type} response payload:`,
							result.error,
							response.payload,
						);
						reject(
							new ApiError({
								message: `websocket command ${type} returned an unexpected payload`,
								request,
								cause: result.error,
							}),
						);
					});
				},
			)
				.then((fn) => (settled ? fn() : (unlisten = fn)))
				.catch(failed);

			invoke("ws_send", { command: { type, ref_id, payload } }).catch(
				failed,
			);
		});
	}

	onEventRejected(handler: (eventType: string) => void): () => void {
		this.#rejectedHandlers.add(handler);
		return () => this.#rejectedHandlers.delete(handler);
	}

	on<T>(
		eventType: string | string[],
		schema: z.ZodType<T>,
		handler: (payload: T) => void,
	): Promise<() => void> {
		const eventTypes = Array.isArray(eventType) ? eventType : [eventType];
		return Promise.all(
			eventTypes.map((type) =>
				listen<unknown>(
					`grindr:${type.replaceAll(".", "_")}`,
					(event) => {
						const result = schema.safeParse(event.payload);
						if (result.success) {
							handler(result.data);
							return;
						}
						console.error(
							`[ws] unexpected payload for ${type}:`,
							result.error,
							event.payload,
						);
						for (const rejected of this.#rejectedHandlers)
							rejected(type);
					},
				),
			),
		).then(
			(unlisteners) => () =>
				unlisteners.forEach((unlisten) => {
					unlisten();
				}),
		);
	}
}

export const ws = new WsState();
