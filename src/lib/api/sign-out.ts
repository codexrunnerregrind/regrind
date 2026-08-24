import { goto } from "$app/navigation";

import { clearAccountCaches } from "$lib/api/account-caches";
import { callMethod } from "$lib/api/methods";
import { clearAccountPreferences } from "$lib/app-data/preferences.svelte";
import { inboxLastViewed } from "$lib/chat/inbox-last-viewed.svelte";
import { tapsLastViewed } from "$lib/interest/taps-last-viewed";

export async function signOut(): Promise<void> {
	// Read who we are before the session goes: the markers below are keyed by
	// profile, and once `logout` has run there is no id left to key them by.
	const profileId = await callMethod("auth_state").catch(() => null);

	try {
		await callMethod("logout");
	} catch (error) {
		console.error(error);
	}

	await goto("/auth/sign-in");

	if (profileId !== null)
		for (const marker of [inboxLastViewed, tapsLastViewed])
			marker.clearStored(profileId);
	clearAccountCaches();

	try {
		await clearAccountPreferences();
	} catch (error) {
		console.error(error);
	}
}
