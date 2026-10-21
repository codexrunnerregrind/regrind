import { afterEach, describe, expect, it } from "vitest";

import { fromBase64 } from "$lib/util/base64";
import {
	isProxiedMediaUrl,
	profileMediaUrl,
	proxyMediaUrl,
	unproxyMediaUrl,
} from "$lib/util/media";

const PHOTO = "https://cdns.grindr.com/images/thumb/320x320/deadbeef";
const SIGNED =
	"https://d3lyqctnm3b6pb.cloudfront.net/a.jpg?Expires=1&Signature=x+y/z&Key-Pair-Id=K1";

const tauri = globalThis as {
	isTauri?: boolean;
	__TAURI_INTERNALS__?: {
		convertFileSrc: (filePath: string, protocol?: string) => string;
	};
};

function runningOn(osName: string) {
	tauri.isTauri = true;
	tauri.__TAURI_INTERNALS__ = {
		convertFileSrc: (filePath, protocol = "asset") => {
			const path = encodeURIComponent(filePath);
			if (osName === "android")
				return `https://${protocol}.localhost/${path}`;
			return osName === "windows"
				? `http://${protocol}.localhost/${path}`
				: `${protocol}://localhost/${path}`;
		},
	};
}

function proxiedTarget(url: string): string {
	const encoded = url.slice(url.lastIndexOf("/") + 2);
	const standard = encoded.replaceAll("-", "+").replaceAll("_", "/");
	return new TextDecoder().decode(fromBase64(standard));
}

afterEach(() => {
	delete tauri.isTauri;
	delete tauri.__TAURI_INTERNALS__;
});

describe("proxyMediaUrl", () => {
	it("leaves urls alone outside Tauri, where no handler exists", () => {
		expect(proxyMediaUrl(PHOTO)).toBe(PHOTO);
		expect(proxyMediaUrl(SIGNED)).toBe(SIGNED);
	});

	it("carries the whole url to the scheme handler", () => {
		runningOn("macos");

		const proxied = proxyMediaUrl(SIGNED);

		expect(proxied.startsWith("ogmedia://localhost/")).toBe(true);
		expect(proxiedTarget(proxied)).toBe(SIGNED);
	});

	it("uses the http form the platforms that need it expect", () => {
		runningOn("windows");

		const proxied = proxyMediaUrl(PHOTO);

		expect(proxied.startsWith("http://ogmedia.localhost/")).toBe(true);
		expect(proxiedTarget(proxied)).toBe(PHOTO);
	});

	it("never percent-encodes, so the android scheme rewrite cannot bite", () => {
		runningOn("android");

		expect(proxyMediaUrl(SIGNED)).not.toContain("%");
	});

	it("tags which stack the Rust handler should imitate", () => {
		runningOn("macos");

		expect(proxyMediaUrl(PHOTO)).toContain("/i");
		expect(proxyMediaUrl(PHOTO, { as: "image" })).toBe(
			proxyMediaUrl(PHOTO),
		);
		expect(proxyMediaUrl(PHOTO, { as: "video" })).toContain("/v");
		expect(proxiedTarget(proxyMediaUrl(PHOTO, { as: "video" }))).toBe(
			PHOTO,
		);
	});

	it("passes through anything that is not a remote url", () => {
		runningOn("macos");

		for (const url of ["blob:nothing", "", "http://cdns.grindr.com/x"]) {
			expect(proxyMediaUrl(url)).toBe(url);
		}
		expect(proxyMediaUrl(null)).toBeNull();
		expect(proxyMediaUrl(undefined)).toBeNull();
	});
});

describe("profileMediaUrl", () => {
	it("builds the CDN url for each size and proxies it", () => {
		runningOn("macos");

		expect(
			proxiedTarget(
				profileMediaUrl({ mediaHash: "deadbeef", size: "thumb" }),
			),
		).toBe("https://cdns.grindr.com/images/thumb/320x320/deadbeef");
		expect(
			proxiedTarget(
				profileMediaUrl({ mediaHash: "deadbeef", size: "full" }),
			),
		).toBe("https://cdns.grindr.com/images/profile/1024x1024/deadbeef");
	});
});

describe("unproxyMediaUrl", () => {
	it("round-trips a proxied url back to the one behind it", () => {
		for (const os of ["macos", "windows", "android"]) {
			runningOn(os);

			expect(unproxyMediaUrl(proxyMediaUrl(SIGNED))).toBe(SIGNED);
			expect(unproxyMediaUrl(proxyMediaUrl(PHOTO))).toBe(PHOTO);
		}
	});

	it("recovers the url a video slide was proxied under too", () => {
		runningOn("macos");

		expect(unproxyMediaUrl(proxyMediaUrl(SIGNED, { as: "video" }))).toBe(
			SIGNED,
		);
	});

	it("passes through anything that was never proxied", () => {
		expect(unproxyMediaUrl(SIGNED)).toBe(SIGNED);
		expect(unproxyMediaUrl("blob:tauri://localhost/abc")).toBe(
			"blob:tauri://localhost/abc",
		);
		expect(unproxyMediaUrl("")).toBe("");
	});

	it("hands back a proxied url whose payload is not decodable", () => {
		const broken = "ogmedia://localhost/i!!!not-base64!!!";

		expect(unproxyMediaUrl(broken)).toBe(broken);
	});

	it("refuses a payload that decodes to a non-https url", () => {
		runningOn("macos");
		const smuggled = proxyMediaUrl(PHOTO).replace(
			/\/i.+$/,
			`/i${btoa("file:///etc/passwd").replaceAll("=", "")}`,
		);

		expect(unproxyMediaUrl(smuggled)).toBe(smuggled);
	});
});

describe("isProxiedMediaUrl", () => {
	it.each(["macos", "android"])(
		"recognizes the form the proxy takes on %s",
		(osName) => {
			runningOn(osName);

			expect(isProxiedMediaUrl(new URL(proxyMediaUrl(PHOTO)))).toBe(true);
		},
	);

	it.each([PHOTO, "http://tauri.localhost/", "tauri://localhost/chat"])(
		"tells %s apart from proxied media",
		(url) => {
			expect(isProxiedMediaUrl(new URL(url))).toBe(false);
		},
	);
});
