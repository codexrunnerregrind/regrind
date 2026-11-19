import { authenticate, checkStatus } from "@tauri-apps/plugin-biometric";
import { toast } from "svelte-sonner";

import {
	preferencesLoaded,
	preferencesSnapshot,
	setPreferences,
} from "#lib/app-data/preferences.svelte.ts";
import { t } from "#lib/i18n/index.ts";
import { isMobilePlatform } from "#lib/platform/os.ts";

// Codes meaning the device has no screen lock at all, so nothing can unlock.
const NO_SCREEN_LOCK = ["passcodeNotSet", "noDeviceCredential"];
const PAINT_SETTLE_MS = 150;

let locked = $state(true);
let away = $state(false);
let authenticating = $state(false);
let promptedThisLock = false;
let hiddenAt: number | null = null;

export function appLockAvailable(): boolean {
	return isMobilePlatform();
}

function enabled(): boolean {
	return (
		appLockAvailable() &&
		preferencesLoaded() &&
		preferencesSnapshot().appLock
	);
}

/** Covers the app while locked, and while it's in the background. */
export function appLockCovering(): boolean {
	return enabled() && (locked || away);
}

export function appLocked(): boolean {
	return enabled() && locked;
}

export function appLockAuthenticating(): boolean {
	return authenticating;
}

function errorCode(error: unknown): string | null {
	if (typeof error === "object" && error !== null && "code" in error) {
		return String(error.code);
	}
	const text = String(error);
	return NO_SCREEN_LOCK.find((code) => text.includes(code)) ?? null;
}

async function noScreenLock(error: unknown): Promise<boolean> {
	const code = errorCode(error);
	if (code !== null && NO_SCREEN_LOCK.includes(code)) return true;
	const status = await checkStatus().catch(() => null);
	return status?.errorCode === "passcodeNotSet";
}

async function verify(reason: string): Promise<void> {
	authenticating = true;
	try {
		await authenticate(reason, {
			allowDeviceCredential: true,
			title: "ReGrind",
		});
	} finally {
		authenticating = false;
	}
}

export async function unlockApp(): Promise<void> {
	if (authenticating) return;
	promptedThisLock = true;
	try {
		await verify(t("settings.app.appLock.reason.unlock"));
		locked = false;
	} catch (error) {
		if (!(await noScreenLock(error))) return;
		// Fail closed otherwise; without a screen lock the phone is open anyway.
		await setPreferences({ appLock: false });
		locked = false;
		toast(t("settings.app.appLock.turnedOff"));
	}
}

function canPrompt(): boolean {
	return (
		appLocked() &&
		!away &&
		!authenticating &&
		!promptedThisLock &&
		document.visibilityState === "visible"
	);
}

/**
 * Unlocks on its own once per lock, when the app is in front. Waits for the
 * cover to paint: Android pauses the WebView behind the prompt, and one that
 * never drew stays white.
 */
export function promptWhenLocked(): void {
	if (!canPrompt()) return;
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			setTimeout(() => {
				if (canPrompt()) void unlockApp();
			}, PAINT_SETTLE_MS);
		});
	});
}

/** Asks for the screen lock first, so it can't be turned on unusable. */
export async function setAppLock(on: boolean): Promise<void> {
	if (on) await verify(t("settings.app.appLock.reason.turnOn"));
	locked = false;
	await setPreferences({ appLock: on });
}

function lock(): void {
	locked = true;
	promptedThisLock = false;
}

export function installAppLock(): () => void {
	const onVisibility = () => {
		// Android shows the prompt in its own activity, which hides ours.
		if (authenticating || !enabled()) return;
		if (document.visibilityState === "hidden") {
			away = true;
			hiddenAt ??= Date.now();
			if (preferencesSnapshot().appLockAfter === 0) lock();
			return;
		}
		const awayFor = hiddenAt === null ? 0 : Date.now() - hiddenAt;
		hiddenAt = null;
		if (awayFor >= preferencesSnapshot().appLockAfter * 1000) lock();
		away = false;
		promptWhenLocked();
	};
	document.addEventListener("visibilitychange", onVisibility);
	return () => {
		document.removeEventListener("visibilitychange", onVisibility);
	};
}

export function resetAppLockForTests(): void {
	locked = true;
	away = false;
	authenticating = false;
	promptedThisLock = false;
	hiddenAt = null;
}
