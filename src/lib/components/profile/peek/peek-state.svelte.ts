import { goto } from "$app/navigation";
import { toast } from "svelte-sonner";

import { httpStatusOf } from "$lib/api/api-error";
import { blockUser } from "$lib/api/browse/blocks";
import { showErrorToast } from "$lib/api/error-toast";
import { sendTap } from "$lib/api/interest/taps";
import { forgetFavoriteNote } from "$lib/api/users/favorite-notes-state.svelte";
import { addFavoriteUser, removeFavoriteUser } from "$lib/api/users/favorites";
import { mergeProfileEditIntoCaches } from "$lib/api/users/profiles";
import { preferencesSnapshot } from "$lib/app-data/preferences.svelte";
import { showBlockFailure } from "$lib/components/report/block-failure";
import { hapticImpact } from "$lib/haptics";
import { TapType } from "$lib/model/interest/taps";
import {
	type LongPressHandlers,
	longPressHandlers,
} from "$lib/util/long-press";
import { reducedMotion } from "$lib/util/reduced-motion";
import type { RightNowStatus } from "$lib/model/right-now";

export type PeekProfile = {
	profileId: number;
	displayName: string | null;
	mediaHash: string | null;
	isFavorite: boolean;
	age?: number | null;
	distance?: number | null;
	onlineUntil?: number | null;
	isVisiting?: boolean;
	rightNow?: RightNowStatus | null;
	note?: string | null;
};

type Burst = { id: number; x: number; y: number };

class ProfilePeekState {
	current = $state<{ anchor: HTMLElement; profile: PeekProfile } | null>(
		null,
	);
	burst = $state<Burst | null>(null);
	confirmBlock = $state<PeekProfile | null>(null);

	open(anchor: HTMLElement, profile: PeekProfile): void {
		if (this.current === null) this.current = { anchor, profile };
	}

	close(): void {
		this.current = null;
	}

	celebrate(rect: DOMRect): void {
		if (reducedMotion.current) return;
		this.burst = {
			id: Date.now(),
			x: rect.left + rect.width / 2,
			y: rect.top + rect.height / 2,
		};
	}
}

export const profilePeek = new ProfilePeekState();

export function conversationIdWith(
	profileId: number,
	ourProfileId: number,
): string {
	return [profileId, ourProfileId].toSorted((a, b) => a - b).join(":");
}

/** Clicks the tile's own link so callers' onclick (e.g. the grid deck) runs. */
export function openProfileFrom(anchor: HTMLElement, profileId: number): void {
	const href = `/profile/${profileId}`;
	const link =
		anchor instanceof HTMLAnchorElement
			? anchor
			: anchor.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);
	if (link?.isConnected) link.click();
	else void goto(href);
}

// So the profile screen's tap button shows it without a refetch.
function markTapped(profileId: number): void {
	mergeProfileEditIntoCaches({
		cacheProfileId: profileId,
		patch: { tapped: true, tapType: TapType.Hot },
	});
}

export async function quickTap(profile: PeekProfile): Promise<boolean> {
	try {
		await sendTap({ recipientId: profile.profileId, tapType: TapType.Hot });
		markTapped(profile.profileId);
		toast.success(
			profile.displayName ? `Tapped ${profile.displayName}` : "Tap sent",
		);
		return true;
	} catch (error) {
		if (httpStatusOf(error) === 400) {
			toast("Already tapped");
			markTapped(profile.profileId);
			return true;
		}
		console.error(error);
		showErrorToast({ label: "Failed to send tap", error });
		return false;
	}
}

export async function quickFavorite(
	profileId: number,
	next: boolean,
): Promise<boolean> {
	try {
		if (next) await addFavoriteUser({ profileId });
		else {
			await removeFavoriteUser({ profileId });
			forgetFavoriteNote(profileId);
		}
		mergeProfileEditIntoCaches({
			cacheProfileId: profileId,
			patch: { isFavorite: next },
		});
		return true;
	} catch (error) {
		console.error(error);
		showErrorToast({
			label: next
				? "Failed to add to favorites"
				: "Failed to remove from favorites",
			error,
		});
		return false;
	}
}

export async function quickBlock(profile: PeekProfile): Promise<void> {
	if (preferencesSnapshot().confirmBlock) {
		profilePeek.confirmBlock = profile;
		return;
	}
	try {
		await blockUser({ profileId: profile.profileId });
		toast.success("User blocked");
	} catch (error) {
		console.error(error);
		showBlockFailure(error);
	}
}

let tapping = false;

async function doubleTap(anchor: HTMLElement, profile: PeekProfile) {
	if (tapping) return;
	tapping = true;
	hapticImpact("medium");
	profilePeek.celebrate(anchor.getBoundingClientRect());
	await quickTap(profile);
	tapping = false;
}

/**
 * Long-press peek and double-tap-to-tap for a profile tile or row, per the
 * Miscellaneous settings. Read inside `$derived` so toggles apply live.
 */
export function profileGestures(
	anchor: () => HTMLElement | null,
	profile: () => PeekProfile,
): LongPressHandlers | undefined {
	const { gridDoubleTapToTap, gridLongPressMenu } = preferencesSnapshot();
	if (!gridDoubleTapToTap && !gridLongPressMenu) return undefined;
	return longPressHandlers(
		() => {
			const element = anchor();
			if (gridLongPressMenu && element)
				profilePeek.open(element, profile());
		},
		gridDoubleTapToTap
			? () => {
					const element = anchor();
					if (element) void doubleTap(element, profile());
				}
			: undefined,
		{ deferTapAction: true },
	);
}
