import { convertFileSrc, isTauri } from "@tauri-apps/api/core";

import { demoEnabled, demoMediaUrl } from "$lib/demo";
import { fromBase64Url, toBase64Url } from "$lib/util/base64";

const MEDIA_SCHEME = "ogmedia";

const CDN_VARIANTS = {
	thumb: "thumb/320x320",
	full: "profile/1024x1024",
} as const;

const FETCHER_TAG = { image: "i", video: "v" } as const;

type ProxyOptions = { as?: keyof typeof FETCHER_TAG };

export function proxyMediaUrl(url: string, options?: ProxyOptions): string;
export function proxyMediaUrl(
	url: string | null | undefined,
	options?: ProxyOptions,
): string | null;
export function proxyMediaUrl(
	url: string | null | undefined,
	{ as = "image" }: ProxyOptions = {},
): string | null {
	if (typeof url !== "string") return null;
	if (demoEnabled || !isTauri()) return url;
	if (!url.startsWith("https://")) return url;
	const payload = toBase64Url(new TextEncoder().encode(url));
	return convertFileSrc(`${FETCHER_TAG[as]}${payload}`, MEDIA_SCHEME);
}

/**
 * The inverse of {@link proxyMediaUrl}, for anything that takes a url outside
 * the webview: the proxy scheme means nothing to an HTTP client.
 */
export function unproxyMediaUrl(url: string): string {
	// `convertFileSrc` spells the proxy as a scheme, or a subdomain on windows
	// and android (https there, as the app origin is).
	const prefix = [
		`${MEDIA_SCHEME}://localhost/`,
		`http://${MEDIA_SCHEME}.localhost/`,
		`https://${MEDIA_SCHEME}.localhost/`,
	].find((candidate) => url.startsWith(candidate));
	if (prefix === undefined) return url;
	// A one-character fetcher tag, then the url.
	const encoded = decodeURIComponent(url.slice(prefix.length)).slice(1);
	try {
		const decoded = new TextDecoder().decode(fromBase64Url(encoded));
		// Only https ever went in, so anything else was not ours.
		return decoded.startsWith("https://") ? decoded : url;
	} catch {
		return url;
	}
}

export function isProxiedMediaUrl(url: URL): boolean {
	return (
		url.protocol === `${MEDIA_SCHEME}:` ||
		url.hostname === `${MEDIA_SCHEME}.localhost`
	);
}

export function profileMediaUrl({
	mediaHash,
	size,
}: {
	mediaHash: string;
	size: keyof typeof CDN_VARIANTS;
}): string {
	if (demoEnabled) return demoMediaUrl(mediaHash);
	return proxyMediaUrl(
		`https://cdns.grindr.com/images/${CDN_VARIANTS[size]}/${mediaHash}`,
	);
}

export function retryMediaSrc({
	src,
	attempt,
}: {
	src: string;
	attempt: number;
}): string {
	return `${src}${src.includes("?") ? "&" : "?"}retry=${attempt}`;
}

export function firstFrameSrc(src: string): string {
	return `${src}#t=0.001`;
}

export function releaseVideoOnDestroy(video: HTMLVideoElement): () => void {
	return () => {
		video.removeAttribute("src");
		video.load();
	};
}
