import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRestMock } = vi.hoisted(() => ({ fetchRestMock: vi.fn() }));

vi.mock("$lib/api/transport", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/transport")>()),
	fetchRest: fetchRestMock,
}));

import { ApiError } from "$lib/api/api-error";
import {
	getVideoCallInfo,
	joinVideoCall,
	startVideoCall,
} from "$lib/api/messaging/video-calls";

/** A stand-in for what `fetchRest` hands back, in the shape callers use. */
function response({ status, body }: { status: number; body: unknown }) {
	const text = typeof body === "string" ? body : JSON.stringify(body);
	const json = () => {
		try {
			return JSON.parse(text);
		} catch (error) {
			throw new ApiError({
				message: "Failed to parse API response",
				request: { method: "POST", path: "/v1/video-call" },
				cause: error,
			});
		}
	};
	return {
		status,
		json,
		text: () => text,
		assertOk() {
			if (status >= 200 && status < 300) return;
			throw new ApiError({
				message: `API request failed with status ${status}`,
				request: { method: "POST", path: "/v1/video-call" },
				response: { status, body: text },
			});
		},
		jsonParsed: <Schema extends { parse: (data: unknown) => unknown }>(
			schema: Schema,
		) => schema.parse(json()),
	};
}

const refusal = {
	result: "TARGET_PROFILE_UNAVAILABLE",
	channelId: null,
	token: null,
	maxSeconds: null,
	message: null,
};

describe("startVideoCall", () => {
	beforeEach(() => {
		fetchRestMock.mockReset();
	});

	it("reads a call the server placed", async () => {
		fetchRestMock.mockResolvedValue(
			response({
				status: 200,
				body: {
					result: "SUCCESS",
					channelId: "channel-1",
					token: "token-1",
					maxSeconds: 60,
					message: null,
				},
			}),
		);

		await expect(startVideoCall(7)).resolves.toMatchObject({
			result: "SUCCESS",
			channelId: "channel-1",
		});
		expect(fetchRestMock).toHaveBeenCalledWith("/v1/video-call", {
			method: "POST",
			body: { targetProfileId: 7 },
		});
	});

	it("reads a refusal the server sent as a 2xx", async () => {
		fetchRestMock.mockResolvedValue(
			response({ status: 200, body: refusal }),
		);

		await expect(startVideoCall(7)).resolves.toMatchObject({
			result: "TARGET_PROFILE_UNAVAILABLE",
		});
	});

	// The same refusal also arrives as a 400 (confirmed in the wild). Raising
	// that as an error would reach the screen as "something went wrong" rather
	// than "they're unavailable", so the body is read at either status.
	it("reads the same refusal when it arrives as a 400", async () => {
		fetchRestMock.mockResolvedValue(
			response({ status: 400, body: refusal }),
		);

		await expect(startVideoCall(7)).resolves.toMatchObject({
			result: "TARGET_PROFILE_UNAVAILABLE",
			channelId: null,
		});
	});

	// Only a body that names a result is a refusal. Everything else outside
	// 2xx is a failure and has to keep behaving like one.
	it.each([
		["a body with no result in it", 400, { channelId: null }],
		["an error page", 502, "<html>Bad Gateway</html>"],
		["an empty body", 500, ""],
	])("raises %s", async (_name, status, body) => {
		fetchRestMock.mockResolvedValue(response({ status, body }));

		await expect(startVideoCall(7)).rejects.toThrow(ApiError);
	});

	it("raises a server error even when it is valid JSON", async () => {
		fetchRestMock.mockResolvedValue(
			response({ status: 500, body: { error: "boom" } }),
		);

		await expect(startVideoCall(7)).rejects.toThrow(ApiError);
	});
});

describe("joinVideoCall", () => {
	beforeEach(() => {
		fetchRestMock.mockReset();
	});

	it("answers on the channel it is given", async () => {
		fetchRestMock.mockResolvedValue(
			response({ status: 200, body: { token: "token-2" } }),
		);

		await expect(joinVideoCall("channel-9")).resolves.toMatchObject({
			token: "token-2",
		});
		expect(fetchRestMock).toHaveBeenCalledWith("/v1/video-call/join", {
			method: "PATCH",
			body: { channelId: "channel-9" },
		});
	});

	it("reads a refusal to let us join, however it arrives", async () => {
		fetchRestMock.mockResolvedValue(
			response({ status: 400, body: { result: "CALL_NOT_FOUND" } }),
		);

		await expect(joinVideoCall("channel-9")).resolves.toMatchObject({
			result: "CALL_NOT_FOUND",
		});
	});
});

describe("getVideoCallInfo", () => {
	beforeEach(() => {
		fetchRestMock.mockReset();
	});

	// The allowance has no refusal to report, so a non-2xx is only ever a
	// failure here.
	it("raises rather than reporting no time left", async () => {
		fetchRestMock.mockResolvedValue(
			response({ status: 400, body: { result: "NOPE" } }),
		);

		await expect(getVideoCallInfo()).rejects.toThrow(ApiError);
	});
});
