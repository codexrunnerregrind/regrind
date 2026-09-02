import AgoraRTC, {
	type IAgoraRTCClient,
	type ICameraVideoTrack,
	type IMicrophoneAudioTrack,
} from "agora-rtc-sdk-ng";

import {
	webRtcSupported,
	WebRtcUnsupportedError,
} from "$lib/video-call/webrtc-support";

/**
 * Agora needs an App ID alongside the per-call token, and the token response
 * does not carry one. This is Grindr's, read out of the official Android app's
 * RTC engine setup — there is nowhere to fetch it from.
 */
const AGORA_APP_ID = "fb9ba023bdf9430b8f75856a1bb011b9";

// The SDK otherwise posts its own logs to Agora on every call. Nothing here
// reads them, and this client does not report on its users.
AgoraRTC.disableLogUpload();

export type AgoraSessionHandlers = {
	/** Where to render what the other side is sending. */
	onRemoteVideo: (play: (into: HTMLElement) => void) => void;
	/**
	 * The other side's client joined the channel. The only protocol-level
	 * "they picked up" there is: the backend never confirms it. Also fires for
	 * a peer already in the channel when we join, unlike `user-published`.
	 */
	onRemoteJoined: () => void;
	onRemoteLeft: () => void;
	/**
	 * The other side muted or unmuted their camera. A muted camera on an
	 * already-published track shows up here and nowhere else — `user-published`
	 * and `user-unpublished` only fire on publish, not on mute.
	 */
	onRemoteCameraMuted: (muted: boolean) => void;
};

/**
 * One video call's media, as a thin wrapper over Agora's client so that
 * everything above it deals in "join, mute, hang up" rather than in tracks.
 */
export class AgoraSession {
	#client: IAgoraRTCClient;
	#mic: IMicrophoneAudioTrack | null = null;
	#camera: ICameraVideoTrack | null = null;
	#facing: "user" | "environment" = "user";

	constructor(handlers: AgoraSessionHandlers) {
		// The official app uses the live-broadcasting profile rather than the
		// default communication one, which on the web SDK means mode "live" —
		// and there, only a host may publish, so the role has to be set too.
		this.#client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });

		this.#client.on("user-joined", () => handlers.onRemoteJoined());
		this.#client.on("user-left", () => handlers.onRemoteLeft());
		this.#client.on("user-published", (user, mediaType) => {
			void (async () => {
				await this.#client.subscribe(user, mediaType);
				if (mediaType === "video" && user.videoTrack) {
					const track = user.videoTrack;
					handlers.onRemoteVideo((into) => track.play(into));
				}
				// Their audio is played straight out rather than handed up: no
				// screen has anything to do with it.
				if (mediaType === "audio") user.audioTrack?.play();
			})().catch((error: unknown) => {
				console.error("[video-call] failed to subscribe", error);
			});
		});
		this.#client.on("user-info-updated", (_uid, message) => {
			if (message === "mute-video") handlers.onRemoteCameraMuted(true);
			else if (message === "unmute-video")
				handlers.onRemoteCameraMuted(false);
		});
	}

	/**
	 * Joins the channel and starts publishing. `uid` must be our own profile
	 * id: the token is issued against that uid, and joining under any other
	 * (including a server-assigned one) is rejected as an invalid token even
	 * when the token and channel are right.
	 */
	async join({
		channelId,
		token,
		profileId,
	}: {
		channelId: string;
		token: string;
		profileId: number;
	}): Promise<void> {
		if (!webRtcSupported()) throw new WebRtcUnsupportedError();
		await this.#client.setClientRole("host");
		await this.#client.join(AGORA_APP_ID, channelId, token, profileId);
		[this.#mic, this.#camera] =
			await AgoraRTC.createMicrophoneAndCameraTracks();
		await this.#client.publish([this.#mic, this.#camera]);
	}

	playLocalVideo(into: HTMLElement): void {
		this.#camera?.play(into);
	}

	/**
	 * Feeds a freshly renewed token into the live connection. Rejoining would
	 * do the same thing by tearing the call down and putting it back up.
	 */
	async renewToken(token: string): Promise<void> {
		await this.#client.renewToken(token);
	}

	setMicMuted(muted: boolean): void {
		void this.#mic?.setMuted(muted);
	}

	setCameraMuted(muted: boolean): void {
		void this.#camera?.setMuted(muted);
	}

	/**
	 * Swaps front and back camera without republishing, so the other side sees
	 * a brief freeze rather than the track vanishing. Throws when the device
	 * has no camera facing the other way, which a desktop webcam never does.
	 */
	async switchCamera(): Promise<void> {
		if (!this.#camera) return;
		const next = this.#facing === "user" ? "environment" : "user";
		await this.#camera.setDevice({ facingMode: next });
		this.#facing = next;
	}

	async leave(): Promise<void> {
		try {
			this.#mic?.close();
			this.#camera?.close();
			this.#mic = null;
			this.#camera = null;
			await this.#client.leave();
		} catch (error) {
			// Leaving a channel that is already gone is not worth failing a
			// hang-up over: the UI is coming down either way.
			console.warn("[video-call] leaving the channel failed", error);
		}
	}
}
