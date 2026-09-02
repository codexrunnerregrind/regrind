// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { videoCall } from "$lib/video-call/call-state.svelte";

const {
	startVideoCallMock,
	joinVideoCallMock,
	leaveVideoCallMock,
	getVideoCallInfoMock,
	getProfileMock,
	toastErrorMock,
	toastInfoMock,
	showErrorToastMock,
	wsOnMock,
	agoraJoinMock,
	agoraLeaveMock,
	agoraOpenCameraMock,
	agoraSwitchCameraMock,
} = vi.hoisted(() => ({
	startVideoCallMock: vi.fn(),
	joinVideoCallMock: vi.fn(),
	leaveVideoCallMock: vi.fn(),
	getVideoCallInfoMock: vi.fn(),
	getProfileMock: vi.fn(),
	toastErrorMock: vi.fn(),
	toastInfoMock: vi.fn(),
	showErrorToastMock: vi.fn(),
	wsOnMock: vi.fn(),
	agoraJoinMock: vi.fn(),
	agoraLeaveMock: vi.fn(),
	agoraOpenCameraMock: vi.fn(),
	agoraSwitchCameraMock: vi.fn(),
}));

vi.mock("$lib/api/messaging/video-calls", () => ({
	startVideoCall: startVideoCallMock,
	joinVideoCall: joinVideoCallMock,
	leaveVideoCall: leaveVideoCallMock,
	renewVideoCall: vi.fn(),
	getVideoCallInfo: getVideoCallInfoMock,
}));
vi.mock("$lib/api/users/profiles", () => ({ getProfile: getProfileMock }));
vi.mock("$lib/platform/os", () => ({ isMobilePlatform: () => true }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("svelte-sonner", () => ({
	toast: { error: toastErrorMock, info: toastInfoMock },
}));
vi.mock("$lib/ws.svelte", () => ({
	ws: { on: wsOnMock },
	videocallV1IncomingCallEventSchema: {},
	videocallV1CallEndedEventSchema: {},
}));
vi.mock("$lib/video-call/agora-session", () => ({
	AgoraSession: class {
		constructor(public handlers: Record<string, (arg?: unknown) => void>) {
			handlersOfLastSession = handlers;
		}
		join = agoraJoinMock;
		leave = agoraLeaveMock;
		openCamera = agoraOpenCameraMock;
		switchCamera = agoraSwitchCameraMock;
		playLocalVideo = vi.fn();
		setMicMuted = vi.fn();
		setCameraMuted = vi.fn();
		facing: "user" | "environment" = "user";
		hasCamera = true;
	},
}));

let handlersOfLastSession: Record<string, (arg?: unknown) => void> = {};

/** The handlers the state registered against each realtime event. */
const listeners = new Map<string, (event: { payload: unknown }) => void>();

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const placedCall = {
	result: "SUCCESS",
	channelId: "channel-1",
	token: "token-1",
	maxSeconds: 60,
	message: null,
};

async function startListening() {
	// A fresh account each time, so `start` re-registers rather than deciding
	// it is already listening for this one.
	await videoCall.start(Math.floor(Math.random() * 1_000_000) + 1);
	await settle();
}

describe("videoCall", () => {
	beforeEach(async () => {
		listeners.clear();
		handlersOfLastSession = {};
		vi.clearAllMocks();
		wsOnMock.mockImplementation(
			(
				type: string,
				_schema: unknown,
				handler: (event: { payload: unknown }) => void,
			) => {
				listeners.set(type, handler);
				return Promise.resolve(() => listeners.delete(type));
			},
		);
		getVideoCallInfoMock.mockResolvedValue({ remainingSeconds: 600 });
		getProfileMock.mockResolvedValue({
			displayName: "Sam",
			profileImageMediaHash: "hash-1",
		});
		startVideoCallMock.mockResolvedValue(placedCall);
		joinVideoCallMock.mockResolvedValue({ token: "token-2" });
		leaveVideoCallMock.mockResolvedValue(undefined);
		agoraJoinMock.mockResolvedValue(undefined);
		agoraLeaveMock.mockResolvedValue(undefined);
		agoraOpenCameraMock.mockResolvedValue(undefined);
		agoraSwitchCameraMock.mockResolvedValue("environment");
		// jsdom has no WebRTC of its own, and every entry point checks for it.
		globalThis.RTCPeerConnection ??= class {} as never;
		Object.defineProperty(navigator, "mediaDevices", {
			value: {},
			configurable: true,
		});
		await videoCall.stop();
		await startListening();
	});

	it("reads the allowance once it is listening", () => {
		expect(videoCall.remainingSeconds).toBe(600);
		expect(videoCall.allowanceSpent).toBe(false);
	});

	// The callee is not known to have answered until their client turns up in
	// the channel, so the caller stays on the ringing screen until it does.
	it("rings until the other side joins the channel", async () => {
		await videoCall.call({ profileId: 7, name: "Sam", mediaHash: null });

		expect(videoCall.phase).toBe("outgoing");
		expect(agoraJoinMock).toHaveBeenCalledWith({
			channelId: "channel-1",
			token: "token-1",
			profileId: expect.any(Number),
		});

		handlersOfLastSession.onRemoteJoined?.();

		expect(videoCall.phase).toBe("active");
	});

	// A refusal is an HTTP 2xx, so it reaches us as a result rather than an
	// error, and must not leave the screen ringing at nobody.
	it("says why a refused call is not ringing", async () => {
		startVideoCallMock.mockResolvedValue({
			result: "EXCEED_LENGTH_LIMIT",
			channelId: null,
			token: null,
			maxSeconds: null,
			message: null,
		});

		await videoCall.call({ profileId: 7, name: "Sam", mediaHash: null });

		expect(videoCall.phase).toBe("idle");
		expect(agoraJoinMock).not.toHaveBeenCalled();
		expect(toastErrorMock).toHaveBeenCalledWith(
			"You've used up your video call time",
		);
	});

	// What a call to someone already on a call (or otherwise not reachable)
	// reads as. The server sends this one as a 400, which the api layer reads
	// as the refusal it is rather than raising it as a failure.
	it("says the other side is unavailable rather than something went wrong", async () => {
		startVideoCallMock.mockResolvedValue({
			result: "TARGET_PROFILE_UNAVAILABLE",
			channelId: null,
			token: null,
			maxSeconds: null,
			message: null,
		});

		await videoCall.call({ profileId: 7, name: "Sam", mediaHash: null });

		expect(videoCall.phase).toBe("idle");
		expect(toastErrorMock).toHaveBeenCalledWith(
			"They're unavailable right now",
		);
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("hangs up on a call whose media never came up", async () => {
		agoraJoinMock.mockRejectedValue(new Error("no camera"));

		await videoCall.call({ profileId: 7, name: "Sam", mediaHash: null });

		expect(videoCall.phase).toBe("idle");
		expect(leaveVideoCallMock).toHaveBeenCalledWith("channel-1");
	});

	it("rings for an incoming call and names the caller", async () => {
		listeners.get("videocall.v1.incoming_call")?.({
			payload: { channelId: "channel-9", senderId: 7 },
		});

		expect(videoCall.phase).toBe("incoming");
		expect(videoCall.party?.profileId).toBe(7);

		await settle();

		expect(videoCall.party?.name).toBe("Sam");
		expect(videoCall.party?.mediaHash).toBe("hash-1");
	});

	// The camera comes up while it is still ringing, so that answering is done
	// having seen what is about to go out — and on the camera chosen for it.
	it("previews our own camera before the call is answered", async () => {
		listeners.get("videocall.v1.incoming_call")?.({
			payload: { channelId: "channel-9", senderId: 7 },
		});
		await settle();

		expect(agoraOpenCameraMock).toHaveBeenCalled();
		expect(videoCall.cameraReady).toBe(true);
		expect(videoCall.facing).toBe("user");
		// Nothing is published, and no channel is joined, until we answer.
		expect(agoraJoinMock).not.toHaveBeenCalled();
	});

	it("swaps to the back camera while it is still ringing", async () => {
		listeners.get("videocall.v1.incoming_call")?.({
			payload: { channelId: "channel-9", senderId: 7 },
		});
		await settle();

		expect(videoCall.canFlip).toBe(true);
		await videoCall.switchCamera();

		expect(videoCall.facing).toBe("environment");
	});

	// Turning the camera off before answering is not a reason to offer a swap
	// of a camera that is not running.
	it("stops offering the swap once the camera is off", async () => {
		listeners.get("videocall.v1.incoming_call")?.({
			payload: { channelId: "channel-9", senderId: 7 },
		});
		await settle();

		videoCall.toggleCamera();

		expect(videoCall.cameraOff).toBe(true);
		expect(videoCall.canFlip).toBe(false);
	});

	// The preview and the call are one session, so answering does not stop and
	// restart the camera that has been on screen all along.
	it("answers on the camera the preview already opened", async () => {
		listeners.get("videocall.v1.incoming_call")?.({
			payload: { channelId: "channel-9", senderId: 7 },
		});
		await settle();
		agoraOpenCameraMock.mockClear();

		await videoCall.accept();

		expect(agoraJoinMock).toHaveBeenCalledTimes(1);
		expect(agoraOpenCameraMock).not.toHaveBeenCalled();
	});

	// Answering is a deliberate act, so there is nobody left to wait for: the
	// call is active as soon as our own media is up.
	it("goes straight to the call when we answer", async () => {
		listeners.get("videocall.v1.incoming_call")?.({
			payload: { channelId: "channel-9", senderId: 7 },
		});
		await videoCall.accept();

		expect(joinVideoCallMock).toHaveBeenCalledWith("channel-9");
		expect(agoraJoinMock).toHaveBeenCalledWith(
			expect.objectContaining({
				channelId: "channel-9",
				token: "token-2",
			}),
		);
		expect(videoCall.phase).toBe("active");
	});

	it("gives up on an answer with no token to join with", async () => {
		joinVideoCallMock.mockResolvedValue({ token: null });
		listeners.get("videocall.v1.incoming_call")?.({
			payload: { channelId: "channel-9", senderId: 7 },
		});

		await videoCall.accept();

		expect(videoCall.phase).toBe("idle");
		expect(agoraJoinMock).not.toHaveBeenCalled();
		expect(toastErrorMock).toHaveBeenCalledWith("Couldn't answer the call");
	});

	// A second ring during a call is the caller being told we are unavailable,
	// not something to interrupt the call we are on.
	it("ignores a call arriving while we are on one", async () => {
		await videoCall.call({ profileId: 7, name: "Sam", mediaHash: null });
		handlersOfLastSession.onRemoteJoined?.();

		listeners.get("videocall.v1.incoming_call")?.({
			payload: { channelId: "channel-9", senderId: 99 },
		});

		expect(videoCall.phase).toBe("active");
		expect(videoCall.party?.profileId).toBe(7);
	});

	it("ends the call and says why when the other side declines", async () => {
		await videoCall.call({ profileId: 7, name: "Sam", mediaHash: null });

		listeners.get("videocall.v1.call_ended")?.({
			payload: { channelId: "channel-1", result: "DECLINED" },
		});
		await settle();

		expect(toastInfoMock).toHaveBeenCalledWith("Call declined");
		expect(videoCall.phase).toBe("idle");
	});

	// An event about a channel we are not on says nothing about the call we are.
	it("leaves the call alone for an event about another channel", async () => {
		await videoCall.call({ profileId: 7, name: "Sam", mediaHash: null });
		handlersOfLastSession.onRemoteJoined?.();

		listeners.get("videocall.v1.call_ended")?.({
			payload: { channelId: "channel-other", result: "SUCCESSFUL" },
		});
		await settle();

		expect(videoCall.phase).toBe("active");
	});

	// Their client leaving the channel is the end of the call whether or not
	// the socket ever tells us so.
	it("ends the call when the other side leaves the channel", async () => {
		await videoCall.call({ profileId: 7, name: "Sam", mediaHash: null });
		handlersOfLastSession.onRemoteJoined?.();

		handlersOfLastSession.onRemoteLeft?.();
		await settle();

		expect(agoraLeaveMock).toHaveBeenCalled();
		expect(videoCall.phase).toBe("idle");
	});

	it("puts everything back after a call, ready for the next one", async () => {
		await videoCall.call({ profileId: 7, name: "Sam", mediaHash: null });
		handlersOfLastSession.onRemoteJoined?.();
		videoCall.toggleMic();
		videoCall.toggleCamera();
		videoCall.swapTiles();

		await videoCall.hangUp();

		expect(videoCall.phase).toBe("idle");
		expect(videoCall.party).toBeNull();
		expect(videoCall.micMuted).toBe(false);
		expect(videoCall.cameraOff).toBe(false);
		expect(videoCall.localIsMain).toBe(false);
		expect(videoCall.elapsedSeconds).toBe(0);
	});

	it("refuses to place a call where there is no WebRTC", async () => {
		Object.defineProperty(navigator, "mediaDevices", {
			value: undefined,
			configurable: true,
		});

		expect(videoCall.supported).toBe(false);

		await videoCall.call({ profileId: 7, name: "Sam", mediaHash: null });

		expect(videoCall.phase).toBe("idle");
		expect(startVideoCallMock).not.toHaveBeenCalled();
		expect(toastErrorMock).toHaveBeenCalledWith(
			"Video calls aren't supported on this device",
		);
	});
});
