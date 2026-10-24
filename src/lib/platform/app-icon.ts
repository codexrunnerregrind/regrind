import { invoke } from "@tauri-apps/api/core";

import { isMobilePlatform } from "$lib/platform/os";
import type { AppIconId } from "$lib/platform/app-icon-catalog";

export function appIconAvailable(): boolean {
	return isMobilePlatform();
}

/** `null` is the regular ReGrind icon; an older build may have set an id this one lacks. */
export function getAppIcon(): Promise<string | null> {
	return invoke<string | null>("get_app_icon");
}

export function setAppIcon(icon: AppIconId | null): Promise<void> {
	return invoke("set_app_icon", { icon });
}
