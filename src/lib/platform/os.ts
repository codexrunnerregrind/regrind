import { platform } from "@tauri-apps/plugin-os";

export type SupportedPlatform =
	| "android"
	| "ios"
	| "linux"
	| "macos"
	| "windows";

export const platformNames = {
	android: "Android",
	ios: "iOS",
	linux: "Linux",
	macos: "macOS",
	windows: "Windows",
} as const satisfies Record<SupportedPlatform, string>;

export function currentPlatform(): SupportedPlatform {
	const host = platform();
	switch (host) {
		case "android":
		case "ios":
		case "linux":
		case "macos":
		case "windows":
			return host;
		case "dragonfly":
		case "freebsd":
		case "netbsd":
		case "openbsd":
		case "solaris":
			throw new Error(`ReGrind does not support ${host}`);
	}
}

export function isMobilePlatform(): boolean {
	return runningOnHost("android") || runningOnHost("ios");
}

function hostIsMobile(): boolean {
	switch (currentPlatform()) {
		case "android":
		case "ios":
			return true;
		case "linux":
		case "macos":
		case "windows":
			return false;
	}
}

export function isDesktopPlatform(): boolean {
	try {
		return !hostIsMobile();
	} catch {
		return false;
	}
}

// False outside Tauri, where the os plugin is missing.
function runningOnHost(host: SupportedPlatform): boolean {
	try {
		return currentPlatform() === host;
	} catch {
		return false;
	}
}

export function isAndroidPlatform(): boolean {
	return runningOnHost("android");
}

export function isIosPlatform(): boolean {
	return runningOnHost("ios");
}

export function isLinuxPlatform(): boolean {
	return runningOnHost("linux");
}

export function isMacosPlatform(): boolean {
	return runningOnHost("macos");
}
