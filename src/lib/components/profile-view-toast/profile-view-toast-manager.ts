import { toast } from "svelte-sonner";

import { registerAccountCache } from "$lib/api/account-caches";
import type { NewProfileView } from "$lib/interest/view-activity.svelte";
import ProfileViewToast from "./ProfileViewToast.svelte";

registerAccountCache({
	reset: () => {
		toast.dismiss();
	},
});

const DURATION_MS = 4000;

/**
 * The transient "someone viewed you" bubble. The Interest badge is the durable
 * signal; this is just the glance-able version of it, so it is skipped whenever
 * it would be redundant or stale:
 *
 * - while the Interest tab is open, the list itself already shows the viewer;
 * - while the app is hidden, the bubble's timer stops with the webview and it
 *   would still be sitting there on resume.
 */
export function showProfileViewToast({
	profileId,
	photoHash,
}: NewProfileView): void {
	if (typeof document === "undefined") return;
	if (document.visibilityState !== "visible") return;
	if (location.pathname.startsWith("/interest")) return;

	const id = `view:${profileId}`;
	toast.custom(ProfileViewToast, {
		componentProps: { profileId, photoHash, toastId: id },
		class: "profile-view-toast",
		duration: DURATION_MS,
		id,
	});
}
