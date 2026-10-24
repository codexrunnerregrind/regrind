import { toast } from "svelte-sonner";

import { blockUser } from "$lib/api/browse/blocks";
import { showErrorToast } from "$lib/api/error-toast";
import { showBlockFailure } from "$lib/components/report/block-failure";
import {
	applyViewabilityChange,
	type PendingViewabilityChange,
} from "./profile-state.svelte";

export function blockProfile({
	profileId,
	markBlocked,
}: {
	profileId: number;
	markBlocked: () => PendingViewabilityChange;
}): Promise<void> {
	return applyViewabilityChange({
		change: markBlocked,
		request: () => blockUser({ profileId }),
		showFailure: showBlockFailure,
	});
}

export async function copyProfileId(profileId: number): Promise<void> {
	try {
		const clipboard = await import("@tauri-apps/plugin-clipboard-manager");
		await clipboard.writeText(String(profileId));
		toast.success("Profile ID copied to clipboard");
	} catch (error) {
		console.error(error);
		showErrorToast({ label: "Failed to copy profile ID", error });
	}
}
