import { goto } from "$app/navigation";

import { clearAccountCaches } from "$lib/api/account-caches";
import { accountsState, removeAccount } from "$lib/api/accounts.svelte";
import { signedInProfileId } from "$lib/api/current-session";
import { callMethod } from "$lib/api/methods";
import { clearAccountPreferences } from "$lib/app-data/preferences.svelte";
import { inboxLastViewed } from "$lib/chat/inbox-last-viewed.svelte";
import { tapsLastViewed } from "$lib/interest/taps-last-viewed";
import { clearViewerMatches } from "$lib/interest/viewer-matches";

/**
 * Signs the account in use out and forgets it.
 *
 * With more than one account signed in this drops only the one in use and lands
 * on the next; with one it is the sign-out it always was. The profile is read
 * before anything else because the markers and preferences being dropped are
 * keyed by it, and `sign_out` takes the session that would have named it.
 */
export async function signOut(): Promise<void> {
	const profileId = await signedInProfileId().catch(() => null);
	if (profileId === null) {
		// Nothing signed in — a sign-in in flight, or a session already gone.
		try {
			await callMethod("sign_out");
		} catch (error) {
			console.error(error);
		}
		await accountsState.reload();
		await goto("/auth/sign-in");
		return;
	}
	await removeAccount(profileId);
}

/** Drops the active account's cached state without signing it out. */
export async function clearAccountState(): Promise<void> {
	clearAccountCaches();
	const profileId = await signedInProfileId().catch(() => null);
	if (profileId === null) return;
	for (const marker of [inboxLastViewed, tapsLastViewed])
		marker.clearStored(profileId);
	try {
		await clearAccountPreferences(profileId);
		await clearViewerMatches(profileId);
	} catch (error) {
		console.error(error);
	}
}
