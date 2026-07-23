import {
	checkPermissions,
	getCurrentPosition,
	requestPermissions,
} from "@tauri-apps/plugin-geolocation";
import { platform } from "@tauri-apps/plugin-os";

import { encodeGeohash } from "$lib/model/geohash";
import { setPreferences } from "./preferences.svelte";

/** Whether the geolocation API is available on this platform (mobile only). */
export function geoApiSupported(): boolean {
	try {
		return ["android", "ios"].includes(platform());
	} catch {
		return false;
	}
}

/** Thrown by {@link fetchCurrentGeohash} when location access is not granted. */
export class LocationPermissionDeniedError extends Error {
	constructor() {
		super("Location permission denied");
		this.name = "LocationPermissionDeniedError";
	}
}

/**
 * Reads the device's current position and returns its geohash.
 *
 * When `request` is true a permission prompt is shown if needed; when false the
 * call only proceeds if permission was already granted (useful for silent
 * refreshes that should never interrupt the user). Throws
 * {@link LocationPermissionDeniedError} if access is not granted.
 */
export async function fetchCurrentGeohash(request = true): Promise<string> {
	let permissions = await checkPermissions();
	if (
		request &&
		(permissions.location === "prompt" ||
			permissions.location === "prompt-with-rationale")
	) {
		permissions = await requestPermissions(["location"]);
	}
	if (permissions.location !== "granted") {
		throw new LocationPermissionDeniedError();
	}
	const {
		coords: { latitude, longitude },
	} = await getCurrentPosition();
	return encodeGeohash(latitude, longitude);
}

/**
 * Detects the current position and switches the app into "current location"
 * mode so subsequent grid refreshes keep tracking the device. The manually
 * picked `geohash` is left untouched so it can be restored later.
 */
export async function switchToCurrentLocation(): Promise<void> {
	const currentGeohash = await fetchCurrentGeohash(true);
	await setPreferences({ currentGeohash, usingCurrentLocation: true });
}
