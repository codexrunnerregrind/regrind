/**
 * Whether this webview can carry a call at all — kept apart from the Agora
 * wrapper so that asking the question does not pull the SDK into the bundle.
 *
 * Some webviews ship without `RTCPeerConnection`, confirmed on several
 * WebKitGTK builds whatever flags the host sets. Agora only fails on that deep
 * inside an async rejection, by which point signalling has succeeded and the
 * call looks connected with no media in it — so every entry point asks first
 * and says so up front instead.
 */
export function webRtcSupported(): boolean {
	return (
		typeof RTCPeerConnection !== "undefined" &&
		typeof navigator !== "undefined" &&
		navigator.mediaDevices !== undefined
	);
}

export class WebRtcUnsupportedError extends Error {
	constructor() {
		super("This webview has no WebRTC support");
		this.name = "WebRtcUnsupportedError";
	}
}
