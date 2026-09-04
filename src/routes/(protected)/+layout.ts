import { redirect } from "@sveltejs/kit";

import { callMethod } from "$lib/api/methods";
import { usePreferencesForAccount } from "$lib/app-data/preferences.svelte";
import { seedExpiringMediaEntitlement } from "$lib/entitlements/expiring-media-entitlement";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async () => {
	const profileId = await callMethod("auth_state");
	if (profileId === null) {
		redirect(303, "/auth/sign-in");
	}
	// Before anything protected renders: the account-scoped half of the
	// preferences lives in this account's own file, and every screen reads one
	// merged snapshot.
	await usePreferencesForAccount(profileId);
	// Unlock expiring photos and message unsend for this account, once per run.
	// Started but not awaited, so a switch lands on the new account at once; the
	// grid holds its first request until this settles (see awaitEntitlementSeed),
	// so the granting region is still the last one reported before the session
	// re-establishes. Re-runs on switch, when `invalidateAll` re-runs this load.
	void seedExpiringMediaEntitlement(profileId);
	return { ourProfileId: profileId };
};
