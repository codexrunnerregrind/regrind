import type z from "zod";

import { fetchRest } from "$lib/api/transport";
import {
	videoCallInfoSchema,
	videoCallJoinSchema,
	videoCallRenewSchema,
	videoCallStartSchema,
} from "$lib/model/messaging/video-calls";

type RestResponse = Awaited<ReturnType<typeof fetchRest>>;

/**
 * Reads a call response that may be a refusal, whichever way round the server
 * chose to send it.
 *
 * A refusal — no allowance left, the other side already on a call — arrives
 * *either* as an HTTP 2xx whose `result` is not `SUCCESS`, *or* as the very
 * same body under a 400. Both are the server declining to place a call rather
 * than the request failing, and the difference is not ours to explain to
 * anyone: a 400 raised as an error would reach the screen as "something went
 * wrong" instead of "they're unavailable".
 *
 * So a body that names a `result` is read at any status, and only a response
 * with nothing to say — a real failure, an error page, an empty body — is
 * raised.
 */
function callResultOrThrow<Schema extends z.ZodType<{ result?: unknown }>>(
	res: RestResponse,
	schema: Schema,
): z.infer<Schema> {
	if (res.status >= 200 && res.status < 300) return res.jsonParsed(schema);

	const refusal = refusalIn(res, schema);
	if (refusal !== null) return refusal;
	// Nothing recognisable in it, so it was not a refusal but a failure.
	res.assertOk();
	throw new Error("unreachable: assertOk throws outside 2xx");
}

/** The refusal a non-2xx body describes, or null when it describes none. */
function refusalIn<Schema extends z.ZodType<{ result?: unknown }>>(
	res: RestResponse,
	schema: Schema,
): z.infer<Schema> | null {
	let body: unknown;
	try {
		body = res.json();
	} catch {
		// An error page rather than a refusal.
		return null;
	}
	const parsed = schema.safeParse(body);
	// Every field of these schemas is optional, so parsing is not on its own
	// evidence of a refusal — naming a result is.
	return parsed.success && typeof parsed.data.result === "string"
		? parsed.data
		: null;
}

/**
 * Places a call to `targetProfileId`. A 2xx answer is not yet a call: a
 * refusal comes back with a `result` other than `SUCCESS` and nothing to join,
 * so callers must read the result rather than assume the channel is there.
 */
export async function startVideoCall(targetProfileId: number) {
	return await fetchRest("/v1/video-call", {
		method: "POST",
		body: { targetProfileId },
	}).then((res) => callResultOrThrow(res, videoCallStartSchema));
}

/**
 * Answers the call on `channelId`. The response is undocumented; the callee's
 * own token is the one thing we need out of it, and it is not always there.
 */
export async function joinVideoCall(channelId: string) {
	return await fetchRest("/v1/video-call/join", {
		method: "PATCH",
		body: { channelId },
	}).then((res) => callResultOrThrow(res, videoCallJoinSchema));
}

/**
 * Hangs up, declines, or cancels — the server draws no distinction, and the
 * outcome it records depends only on whether the call had connected.
 */
export async function leaveVideoCall(channelId: string) {
	return await fetchRest("/v1/video-call/leave", {
		method: "PATCH",
		body: { channelId },
	}).then((res) => {
		res.assertOk();
	});
}

/**
 * Renews the token for our own live call. Takes no body: the server finds the
 * call from the session, so this cannot be pointed at anyone else's.
 */
export async function renewVideoCall() {
	return await fetchRest("/v1/video-call", { method: "PATCH" }).then((res) =>
		callResultOrThrow(res, videoCallRenewSchema),
	);
}

/** How much calling the account has left this period. */
export async function getVideoCallInfo() {
	return await fetchRest("/v3/video-call").then((res) => {
		res.assertOk();
		return res.jsonParsed(videoCallInfoSchema);
	});
}
