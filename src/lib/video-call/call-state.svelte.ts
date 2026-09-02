import { toast } from "svelte-sonner";

import { showErrorToast } from "$lib/api/error-toast";
import {
	getVideoCallInfo,
	joinVideoCall,
	leaveVideoCall,
	renewVideoCall,
	startVideoCall,
} from "$lib/api/messaging/video-calls";
import { getProfile } from "$lib/api/users/profiles";
import {
	isVideoCallSuccess,
	videoCallResultMessage,
} from "$lib/model/messaging/video-calls";
import {
	webRtcSupported,
	WebRtcUnsupportedError,
} from "$lib/video-call/webrtc-support";
import {
	videocallV1CallEndedEventSchema,
	videocallV1IncomingCallEventSchema,
	ws,
} from "$lib/ws.svelte";
import type { AgoraSession } from "$lib/video-call/agora-session";

export type CallPhase = "idle" | "outgoing" | "incoming" | "active";

export type CallParty = {
	profileId: number;
	name: string | null;
	mediaHash: string | null;
};

/** How long a first token lasts when the server does not say. */
const FALLBACK_MAX_SECONDS = 60;

/** How long before expiry to renew when the server does not say. */
const FALLBACK_REFRESH_SECONDS = 300;

/**
 * The one call this client can be in, and everything the screen showing it
 * needs. There is deliberately only one: the API has no notion of a second
 * concurrent call, and an incoming one arriving mid-call is the other side
 * being told we are unavailable rather than a second ring.
 *
 * Placing and answering a call is REST (`/v1/video-call`), being told about one
 * is the realtime socket (`videocall.v1.*`), and the media itself is Agora —
 * whose SDK is only loaded once a call actually happens, since it is far too
 * large to carry in the main bundle for a feature most sessions never use.
 */
class VideoCallState {
	phase = $state<CallPhase>("idle");
	/** Who we are talking to. Null exactly when the phase is idle. */
	party = $state<CallParty | null>(null);
	micMuted = $state(false);
	cameraOff = $state(false);
	/** Their camera, as reported over the media channel. */
	remoteCameraOff = $state(false);
	/** Seconds since our own media connected, for the in-call clock. */
	elapsedSeconds = $state(0);
	/** Whether our own tile is the big one, swapped by tapping the small one. */
	localIsMain = $state(false);
	/**
	 * The account's remaining allowance for this period, or null before we have
	 * asked. Account-wide, so it is read once and refreshed after each call
	 * rather than per conversation.
	 */
	remainingSeconds = $state<number | null>(null);
	/** Our own face, for our tile while our camera is off. */
	ownMediaHash = $state<string | null>(null);

	/** Set once the local media is up, so the screen can render it. */
	#session: AgoraSession | null = null;
	#channelId: string | null = null;
	#maxSeconds = FALLBACK_MAX_SECONDS;
	#ourProfileId: number | null = null;
	#unlisteners: Promise<() => void>[] = [];
	#renewTimer: ReturnType<typeof setTimeout> | null = null;
	#elapsedTimer: ReturnType<typeof setInterval> | null = null;
	#ending = false;
	/** Where the two video tiles are, once the screen has them. */
	#localTile: HTMLElement | null = null;
	#remoteTile: HTMLElement | null = null;
	#playRemote: ((into: HTMLElement) => void) | null = null;

	/** Whether a call can be placed from this build at all. */
	get supported(): boolean {
		return webRtcSupported();
	}

	/** Whether the account has any calling time left this period. */
	get allowanceSpent(): boolean {
		return this.remainingSeconds !== null && this.remainingSeconds <= 0;
	}

	/**
	 * Why a call cannot be placed, or null when it can. Read by every entry
	 * point rather than worked out at each, so that the menu and the share
	 * sheet cannot come to disagree about whether calling is available.
	 */
	get blockedReason(): string | null {
		if (!this.supported) return "Not supported here";
		if (this.allowanceSpent) return "No time left";
		return null;
	}

	/**
	 * What is left of the allowance, in the coarsest unit that still says
	 * something — or null when there is nothing to say, either because we have
	 * not been told or because a blocking reason already says more.
	 */
	get timeLeftLabel(): string | null {
		const seconds = this.remainingSeconds;
		if (this.blockedReason !== null || seconds === null) return null;
		const minutes = Math.floor(seconds / 60);
		return minutes >= 1 ? `${minutes} min left` : `${seconds}s left`;
	}

	/**
	 * Start listening for incoming calls for the signed-in account. Idempotent,
	 * and re-registers against the new account after a switch.
	 */
	async start(ourProfileId: number): Promise<void> {
		if (this.#ourProfileId === ourProfileId) return;
		if (this.#ourProfileId !== null) await this.stop();
		this.#ourProfileId = ourProfileId;

		// Registration rejects when there is no Tauri runtime under us (a plain
		// browser, a unit test); a listener we never got still has to tear down
		// without throwing.
		const safe = (registering: Promise<() => void>) =>
			registering.catch((error: unknown) => {
				console.error(
					"[video-call] listener registration failed",
					error,
				);
				return () => {};
			});

		this.#unlisteners.push(
			safe(
				ws.on(
					"videocall.v1.incoming_call",
					videocallV1IncomingCallEventSchema,
					(event) => this.#onIncoming(event.payload),
				),
			),
			safe(
				ws.on(
					"videocall.v1.call_ended",
					videocallV1CallEndedEventSchema,
					(event) => this.#onEnded(event.payload),
				),
			),
		);

		// Read the allowance once, so the entry point can say what is left
		// without a request of its own every time a conversation is opened.
		await this.refreshAllowance();

		// Only needed once a call is up and our camera is off, but reading it
		// then would leave the tile blank for as long as the request takes.
		void getProfile(ourProfileId)
			.then((profile) => {
				this.ownMediaHash = profile.profileImageMediaHash;
			})
			.catch((error: unknown) => {
				console.warn("[video-call] could not load our profile", error);
			});
	}

	async stop(): Promise<void> {
		if (this.phase !== "idle") await this.hangUp();
		this.#ourProfileId = null;
		const unlisteners = await Promise.all(this.#unlisteners);
		this.#unlisteners = [];
		for (const unlisten of unlisteners) unlisten();
	}

	async refreshAllowance(): Promise<void> {
		try {
			const { remainingSeconds } = await getVideoCallInfo();
			this.remainingSeconds = remainingSeconds;
		} catch (error) {
			// Not knowing the allowance must not stop a call being tried: the
			// server refuses one it will not allow anyway.
			console.warn("[video-call] could not read the allowance", error);
		}
	}

	/**
	 * Place a call. Stays on the ringing screen until their client actually
	 * joins the channel: nothing in the API says they picked up, so their
	 * arrival in the channel is the only word we get.
	 */
	async call(party: CallParty): Promise<void> {
		if (this.phase !== "idle") return;
		if (!this.supported) {
			toast.error("Video calls aren't supported on this device");
			return;
		}
		if (this.#ourProfileId === null) return;

		this.party = party;
		this.phase = "outgoing";

		let started;
		try {
			started = await startVideoCall(party.profileId);
		} catch (error) {
			this.#reset();
			showErrorToast({ label: "Couldn't start the call", error });
			return;
		}

		// A refused call is an HTTP 2xx with a result other than SUCCESS and
		// nothing to join, so the result — not the status — is what says
		// whether there is a call.
		if (
			!isVideoCallSuccess(started.result) ||
			!started.channelId ||
			!started.token
		) {
			this.#reset();
			toast.error(
				videoCallResultMessage({
					result: started.result,
					fallback: started.message ?? "Couldn't start the call",
				}),
			);
			void this.refreshAllowance();
			return;
		}

		this.#channelId = started.channelId;
		this.#maxSeconds = started.maxSeconds ?? FALLBACK_MAX_SECONDS;
		await this.#connect({
			channelId: started.channelId,
			token: started.token,
			waitForThem: true,
		});
	}

	/**
	 * Answer the call we are being rung for. Goes straight to active once our
	 * own media is up — we already know they are there.
	 */
	async accept(): Promise<void> {
		const channelId = this.#channelId;
		if (this.phase !== "incoming" || channelId === null) return;

		let token: string | null | undefined;
		try {
			const joined = await joinVideoCall(channelId);
			token = joined.token;
			this.#maxSeconds = joined.maxSeconds ?? this.#maxSeconds;
		} catch (error) {
			await this.hangUp();
			showErrorToast({ label: "Couldn't answer the call", error });
			return;
		}

		if (!token) {
			await this.hangUp();
			toast.error("Couldn't answer the call");
			return;
		}

		await this.#connect({ channelId, token, waitForThem: false });
	}

	/**
	 * Hang up, decline, or cancel — one action, because the server draws no
	 * distinction and records the outcome from whether the call had connected.
	 */
	async hangUp(): Promise<void> {
		if (this.#ending || this.phase === "idle") return;
		this.#ending = true;
		const channelId = this.#channelId;
		try {
			await this.#session?.leave();
			if (channelId !== null)
				await leaveVideoCall(channelId).catch((error: unknown) => {
					// The call is over locally whatever the server says; a
					// failed leave is not something to hold the screen open on.
					console.warn("[video-call] leave failed", error);
				});
		} finally {
			this.#reset();
			this.#ending = false;
			// A call just spent some of the allowance.
			void this.refreshAllowance();
		}
	}

	toggleMic(): void {
		this.micMuted = !this.micMuted;
		this.#session?.setMicMuted(this.micMuted);
	}

	toggleCamera(): void {
		this.cameraOff = !this.cameraOff;
		this.#session?.setCameraMuted(this.cameraOff);
	}

	async switchCamera(): Promise<void> {
		try {
			await this.#session?.switchCamera();
		} catch (error) {
			console.warn("[video-call] switching camera failed", error);
			toast.error("Couldn't switch camera");
		}
	}

	swapTiles(): void {
		this.localIsMain = !this.localIsMain;
	}

	/**
	 * Where to render each side. The screen hands these over as its elements
	 * appear and change places, and the tracks are (re)attached to whichever
	 * element is current — a track plays into one element at a time, so a swap
	 * has to move it rather than expect it to follow.
	 */
	setLocalTile(element: HTMLElement | null): void {
		this.#localTile = element;
		if (element) this.#session?.playLocalVideo(element);
	}

	setRemoteTile(element: HTMLElement | null): void {
		this.#remoteTile = element;
		if (element) this.#playRemote?.(element);
	}

	/**
	 * Bring up our own media and, once it is up, the call. The Agora SDK is
	 * imported here rather than at the top of the module so that it is fetched
	 * on the first call rather than at startup.
	 */
	async #connect({
		channelId,
		token,
		waitForThem,
	}: {
		channelId: string;
		token: string;
		waitForThem: boolean;
	}): Promise<void> {
		const ourProfileId = this.#ourProfileId;
		if (ourProfileId === null) return;
		try {
			if (!webRtcSupported()) throw new WebRtcUnsupportedError();
			const { AgoraSession } =
				await import("$lib/video-call/agora-session");
			const session = new AgoraSession({
				onRemoteVideo: (play) => {
					this.#playRemote = play;
					if (this.#remoteTile) play(this.#remoteTile);
				},
				onRemoteJoined: () => {
					if (waitForThem && this.phase === "outgoing")
						this.#markActive();
				},
				onRemoteLeft: () => {
					// Their client leaving the channel ends the call for us
					// too; the socket event saying so may never arrive.
					void this.hangUp();
				},
				onRemoteCameraMuted: (muted) => {
					this.remoteCameraOff = muted;
				},
			});
			await session.join({ channelId, token, profileId: ourProfileId });
			this.#session = session;
			if (this.#localTile) session.playLocalVideo(this.#localTile);
			if (!waitForThem) this.#markActive();
		} catch (error) {
			console.warn("[video-call] could not connect", error);
			toast.error(
				error instanceof WebRtcUnsupportedError
					? "Video calls aren't supported on this device"
					: "Couldn't connect the call. Check camera and microphone access.",
			);
			await this.hangUp();
		}
	}

	#markActive(): void {
		this.phase = "active";
		this.elapsedSeconds = 0;
		this.#elapsedTimer ??= setInterval(() => {
			this.elapsedSeconds += 1;
		}, 1000);
		// The first token only lasts `maxSeconds`, so a call of any length
		// needs it renewed under it. Same schedule as the official app: renew
		// `refreshSeconds` before expiry, or straight away if less is left.
		this.#scheduleRenewal(this.#maxSeconds, FALLBACK_REFRESH_SECONDS);
	}

	#scheduleRenewal(remainingSeconds: number, refreshSeconds: number): void {
		this.#clearRenewal();
		const delayMs = Math.max(remainingSeconds - refreshSeconds, 0) * 1000;
		this.#renewTimer = setTimeout(() => void this.#renew(), delayMs);
	}

	async #renew(): Promise<void> {
		try {
			const renewed = await renewVideoCall();
			const remainingSeconds = renewed.remainingSeconds ?? null;
			if (
				!isVideoCallSuccess(renewed.result) ||
				!renewed.token ||
				remainingSeconds === null
			) {
				// As the official app does: let the call run out on the token
				// it has rather than tearing it down over a failed renewal.
				console.warn("[video-call] token renewal refused", renewed);
				return;
			}
			await this.#session?.renewToken(renewed.token);
			this.#scheduleRenewal(
				remainingSeconds,
				renewed.refreshSeconds ?? FALLBACK_REFRESH_SECONDS,
			);
		} catch (error) {
			console.warn("[video-call] token renewal failed", error);
		}
	}

	#clearRenewal(): void {
		if (this.#renewTimer !== null) clearTimeout(this.#renewTimer);
		this.#renewTimer = null;
	}

	#onIncoming({
		channelId,
		senderId,
	}: {
		channelId: string;
		senderId: number;
	}): void {
		// Already in one: the server tells them we are unavailable, and a
		// second ring here would only interrupt the call we are on.
		if (this.phase !== "idle") return;
		if (!this.supported) return;

		this.#channelId = channelId;
		this.party = { profileId: senderId, name: null, mediaHash: null };
		this.phase = "incoming";

		// The event carries an id and nothing else, so the face and the name
		// come from their profile — the ring shows regardless of whether that
		// resolves.
		void getProfile(senderId)
			.then((profile) => {
				if (this.#channelId !== channelId) return;
				this.party = {
					profileId: senderId,
					name: profile.displayName,
					mediaHash: profile.profileImageMediaHash,
				};
			})
			.catch((error: unknown) => {
				console.warn(
					"[video-call] could not load the caller's profile",
					error,
				);
			});
	}

	#onEnded({
		channelId,
		result,
	}: {
		channelId: string;
		result?: string | null;
	}): void {
		if (this.phase === "idle") return;
		// An event about some other channel is not about the call on screen.
		if (this.#channelId !== null && this.#channelId !== channelId) return;

		const outcome = result?.toUpperCase();
		if (outcome === "UNANSWERED") toast.info("No answer");
		else if (outcome === "DECLINED") toast.info("Call declined");
		else if (outcome === "TARGET_PROFILE_UNAVAILABLE")
			toast.info("They're unavailable right now");
		else if (this.phase !== "active") toast.info("Call ended");

		void this.hangUp();
	}

	#reset(): void {
		this.#clearRenewal();
		if (this.#elapsedTimer !== null) clearInterval(this.#elapsedTimer);
		this.#elapsedTimer = null;
		this.#session = null;
		this.#channelId = null;
		this.#maxSeconds = FALLBACK_MAX_SECONDS;
		this.#playRemote = null;
		this.#localTile = null;
		this.#remoteTile = null;
		this.phase = "idle";
		this.party = null;
		this.micMuted = false;
		this.cameraOff = false;
		this.remoteCameraOff = false;
		this.localIsMain = false;
		this.elapsedSeconds = 0;
	}
}

export const videoCall = new VideoCallState();
