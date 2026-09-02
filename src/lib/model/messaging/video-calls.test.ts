import { describe, expect, it } from "vitest";

import { videoCallMessageSchema } from "$lib/model/messaging/messages";
import {
	formatCallDuration,
	isVideoCallSuccess,
	videoCallInfoSchema,
	videoCallJoinSchema,
	videoCallOutcome,
	videoCallResultMessage,
	videoCallStartSchema,
	videoCallStatusLabel,
} from "$lib/model/messaging/video-calls";

function callMessage(body: unknown) {
	const parsed = videoCallMessageSchema.parse({ type: "VideoCall", body });
	return parsed;
}

describe("the VideoCall message body", () => {
	// The API spells one outcome several ways, and every spelling has to reach
	// the same label rather than falling through to the generic one.
	it.each([
		["SUCCESSFUL", "answered"],
		["Busy", "busy"],
		["BUSY", "busy"],
		["Cancelled", "cancelled"],
		["Declined", "declined"],
		["DECLINED", "declined"],
		["Missed", "missed"],
		["No_Answer", "unanswered"],
		["UNANSWERED", "unanswered"],
		["AB_Unsupported", "unsupported"],
		["Lite_Unsupport", "unsupported"],
	])("reads %s as %s", (result, outcome) => {
		expect(videoCallOutcome(callMessage({ result }))).toBe(outcome);
	});

	// The duration is the more reliable half of the body: a result we have
	// never seen still describes a call that happened when one came with it.
	it("treats an unrecognised result with a duration as answered", () => {
		expect(
			videoCallOutcome(
				callMessage({ result: "Duration:", videoCallDuration: 42 }),
			),
		).toBe("answered");
	});

	it("treats an unrecognised result with no duration as unknown", () => {
		expect(videoCallOutcome(callMessage({ result: "Whatever" }))).toBe(
			"unknown",
		);
		expect(videoCallOutcome(callMessage({ result: null }))).toBe("unknown");
	});

	// One odd body must not take the conversation holding it down.
	it("survives a body that is not the documented shape", () => {
		expect(videoCallOutcome(callMessage(null))).toBe("unknown");
		expect(videoCallOutcome(callMessage("nonsense"))).toBe("unknown");
		expect(videoCallStatusLabel(callMessage([1, 2]))).toBe("Video call");
	});

	it("names an answered call by how long it ran", () => {
		expect(
			videoCallStatusLabel(
				callMessage({ result: "SUCCESSFUL", videoCallDuration: 83 }),
			),
		).toBe("Video call · 1:23");
	});

	// A call that connected for no measurable time is still just a call: there
	// is no duration worth showing.
	it("leaves the duration off an answered call that has none", () => {
		expect(
			videoCallStatusLabel(
				callMessage({ result: "SUCCESSFUL", videoCallDuration: 0 }),
			),
		).toBe("Video call");
	});

	it.each([
		["Declined", "Video call · declined"],
		["UNANSWERED", "Video call · no answer"],
		["Missed", "Missed video call"],
		["Lite_Unsupport", "Video call · not supported"],
	])("names a %s call by why it did not connect", (result, expected) => {
		expect(videoCallStatusLabel(callMessage({ result }))).toBe(expected);
	});

	// A duration on a call that never connected describes nothing, so it is
	// not shown next to the reason it did not.
	it("ignores a duration on a call that never connected", () => {
		expect(
			videoCallStatusLabel(
				callMessage({ result: "Declined", videoCallDuration: 12 }),
			),
		).toBe("Video call · declined");
	});
});

describe("formatCallDuration", () => {
	it.each([
		[0, "0:00"],
		[9, "0:09"],
		[60, "1:00"],
		[83, "1:23"],
		[3600, "60:00"],
	])("renders %ss as %s", (seconds, expected) => {
		expect(formatCallDuration(seconds)).toBe(expected);
	});

	it("drops the fraction of a second rather than showing it", () => {
		expect(formatCallDuration(59.7)).toBe("0:59");
	});
});

describe("a call being placed", () => {
	// A refusal is an HTTP 2xx whose result is not SUCCESS, with nothing to
	// join — so the result, not the status, says whether there is a call.
	it("reads a refusal without demanding a channel", () => {
		const parsed = videoCallStartSchema.parse({
			result: "EXCEED_LENGTH_LIMIT",
			channelId: null,
			token: null,
			maxSeconds: null,
			message: null,
		});

		expect(isVideoCallSuccess(parsed.result)).toBe(false);
		expect(parsed.channelId).toBeNull();
	});

	it("reads a placed call", () => {
		const parsed = videoCallStartSchema.parse({
			result: "SUCCESS",
			channelId: "channel-1",
			token: "token-1",
			maxSeconds: 60,
			message: null,
		});

		expect(isVideoCallSuccess(parsed.result)).toBe(true);
		expect(parsed.maxSeconds).toBe(60);
	});

	it.each([
		["EXCEED_LENGTH_LIMIT", "You've used up your video call time"],
		["TARGET_PROFILE_UNAVAILABLE", "They're unavailable right now"],
	])("says what %s means", (result, expected) => {
		expect(videoCallResultMessage({ result, fallback: "nope" })).toBe(
			expected,
		);
	});

	it("falls back for a result it does not recognise", () => {
		expect(
			videoCallResultMessage({
				result: "SOMETHING_NEW",
				fallback: "nope",
			}),
		).toBe("nope");
		expect(videoCallResultMessage({ result: null, fallback: "nope" })).toBe(
			"nope",
		);
	});
});

describe("answering a call", () => {
	// The join response is undocumented, so a body without the token — or no
	// body at all — has to read as "no token" rather than throw.
	it("reads the token when there is one", () => {
		expect(videoCallJoinSchema.parse({ token: "token-1" }).token).toBe(
			"token-1",
		);
	});

	it.each([[{}], [null], ["nonsense"]])(
		"reads no token out of %j",
		(payload) => {
			expect(videoCallJoinSchema.parse(payload).token ?? null).toBeNull();
		},
	);
});

describe("the remaining allowance", () => {
	it("reads the seconds left", () => {
		expect(videoCallInfoSchema.parse({ remainingSeconds: 600 })).toEqual({
			remainingSeconds: 600,
		});
	});

	// Nothing is not "unknown" here: an answer we cannot read means we do not
	// know of any time left, which is the safe way round for a paid allowance.
	it("reads a body with no seconds in it as none left", () => {
		expect(videoCallInfoSchema.parse({}).remainingSeconds).toBe(0);
	});
});
