import z from "zod";

import type { VideoCallMessage } from "$lib/model/messaging/messages";

/**
 * Why a call is not starting. Both `POST /v1/video-call` and the
 * `videocall.v1.call_ended` event report an outcome this way, and the same
 * codes appear in either place, so one list covers both.
 */
export const videoCallResultSchema = z.string();

/**
 * `POST /v1/video-call`. A refusal comes back as an HTTP 2xx whose `result` is
 * something other than `SUCCESS`, with the channel, the token and the length
 * limit all null — so nothing here may be required.
 */
export const videoCallStartSchema = z.looseObject({
	result: videoCallResultSchema.nullish(),
	channelId: z.string().nullish(),
	token: z.string().nullish(),
	maxSeconds: z.number().nullish(),
	message: z.string().nullish(),
});

export type VideoCallStart = z.infer<typeof videoCallStartSchema>;

/** `PATCH /v1/video-call/join`. Undocumented, and only the token is of use. */
export const videoCallJoinSchema = z
	.looseObject({
		result: videoCallResultSchema.nullish(),
		token: z.string().nullish(),
		channelId: z.string().nullish(),
		maxSeconds: z.number().nullish(),
	})
	.catch({});

export type VideoCallJoin = z.infer<typeof videoCallJoinSchema>;

/**
 * `PATCH /v1/video-call`. Renews the token for our own call in place;
 * `refreshSeconds` is how long before expiry the server wants to be asked
 * again (observed: 300).
 */
export const videoCallRenewSchema = z.looseObject({
	result: videoCallResultSchema.nullish(),
	token: z.string().nullish(),
	remainingSeconds: z.number().nullish(),
	refreshSeconds: z.number().nullish(),
	message: z.string().nullish(),
});

export type VideoCallRenew = z.infer<typeof videoCallRenewSchema>;

/**
 * `GET /v3/video-call`. How much calling the account has left this period —
 * per day on a free account, per month on a paid one. Account-wide, not per
 * conversation.
 */
export const videoCallInfoSchema = z.looseObject({
	remainingSeconds: z.coerce.number().nonnegative().catch(0),
});

export type VideoCallInfo = z.infer<typeof videoCallInfoSchema>;

/** A result that means the call was placed, as opposed to refused. */
export function isVideoCallSuccess(result: string | null | undefined): boolean {
	return result?.toUpperCase() === "SUCCESS";
}

/**
 * What a refusal says. `EXCEED_LENGTH_LIMIT` is the account's allowance being
 * spent; `TARGET_PROFILE_UNAVAILABLE` is the confirmed "they are already on a
 * call" code — there is no separate busy code despite how it reads.
 */
export function videoCallResultMessage({
	result,
	fallback,
}: {
	result: string | null | undefined;
	fallback: string;
}): string {
	switch (result?.toUpperCase()) {
		case "EXCEED_LENGTH_LIMIT":
			return "You've used up your video call time";
		case "TARGET_PROFILE_UNAVAILABLE":
			return "They're unavailable right now";
		default:
			return fallback;
	}
}

/**
 * The outcomes a `VideoCall` status message reports, keyed by every casing and
 * spelling the API has been seen to use for each — `Busy` and `BUSY`,
 * `No_Answer` and `UNANSWERED`, and so on.
 */
const OUTCOMES = {
	SUCCESSFUL: "answered",
	BUSY: "busy",
	CANCELLED: "cancelled",
	DECLINED: "declined",
	MISSED: "missed",
	NO_ANSWER: "unanswered",
	UNANSWERED: "unanswered",
	AB_UNSUPPORTED: "unsupported",
	LITE_UNSUPPORT: "unsupported",
} as const;

export type VideoCallOutcome =
	| (typeof OUTCOMES)[keyof typeof OUTCOMES]
	| "unknown";

const OUTCOME_LABELS: Record<VideoCallOutcome, string> = {
	answered: "Video call",
	busy: "Video call · busy",
	cancelled: "Video call · cancelled",
	declined: "Video call · declined",
	missed: "Missed video call",
	unanswered: "Video call · no answer",
	unsupported: "Video call · not supported",
	unknown: "Video call",
};

/**
 * Which outcome a status message reports. A `result` we do not recognise is
 * still an answered call when it came with a duration — the duration is the
 * more reliable half of the body.
 */
export function videoCallOutcome(message: VideoCallMessage): VideoCallOutcome {
	const key = (message.body.result ?? "")
		.toUpperCase()
		.replaceAll(/[^A-Z]/g, "_");
	const known = OUTCOMES[key as keyof typeof OUTCOMES];
	if (known !== undefined) return known;
	return videoCallDuration(message) > 0 ? "answered" : "unknown";
}

/** How long the call ran, in seconds; zero for one that never connected. */
export function videoCallDuration(message: VideoCallMessage): number {
	const duration = message.body.videoCallDuration ?? 0;
	return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

export function formatCallDuration(seconds: number): string {
	const whole = Math.floor(seconds);
	const minutes = Math.floor(whole / 60);
	return `${minutes}:${(whole % 60).toString().padStart(2, "0")}`;
}

/**
 * What a `VideoCall` message reads as, in the conversation and in every preview
 * of it. An answered call names how long it ran; the rest name why they did not
 * connect.
 */
export function videoCallStatusLabel(message: VideoCallMessage): string {
	const outcome = videoCallOutcome(message);
	const label = OUTCOME_LABELS[outcome];
	const duration = videoCallDuration(message);
	return outcome === "answered" && duration > 0
		? `${label} · ${formatCallDuration(duration)}`
		: label;
}
