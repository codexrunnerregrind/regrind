import { redirect } from "@sveltejs/kit";

import { signedInProfileId } from "$lib/api/current-session";
import { usePreferencesForAccount } from "$lib/app-data/preferences.svelte";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async () => {
	const profileId = await signedInProfileId();
	if (profileId === null) {
		redirect(303, "/auth/sign-in");
	}
	// Before anything protected renders: the account-scoped half of the
	// preferences lives in this account's own file, and every screen reads one
	// merged snapshot.
	await usePreferencesForAccount(profileId);
	return { ourProfileId: profileId };
};
