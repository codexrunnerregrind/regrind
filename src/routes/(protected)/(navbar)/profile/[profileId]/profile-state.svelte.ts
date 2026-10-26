import { toast } from "svelte-sonner";

import { showErrorToast } from "$lib/api/error-toast";
import { findSentTap } from "$lib/api/interest/taps";
import { recordProfileView } from "$lib/api/interest/views";
import {
	BlockedProfileError,
	getProfile,
	HiddenProfileError,
	invalidateProfile,
	isProfileCached,
	isUnviewableProfileError,
	mergeProfileEditIntoCaches,
	ProfileUnavailableError,
	refreshProfile,
} from "$lib/api/users/profiles";
import { getPreferences } from "$lib/app-data/preferences.svelte";
import { TapType } from "$lib/model/interest/taps";
import { Generation } from "$lib/util/generation";
import type { Profile } from "$lib/model/users/profiles";

export type PendingViewabilityChange = {
	revert: () => void;
	settle: () => void;
};

type ViewabilityFailureNotice =
	| { failureLabel: string }
	| { showFailure: (error: unknown) => void };

export async function applyViewabilityChange(
	options: {
		change: () => PendingViewabilityChange;
		request: () => Promise<unknown>;
	} & ViewabilityFailureNotice,
): Promise<void> {
	const { revert, settle } = options.change();
	try {
		await options.request();
		settle();
	} catch (error) {
		revert();
		console.error(error);
		if ("showFailure" in options) options.showFailure(error);
		else showErrorToast({ label: options.failureLabel, error });
	}
}

export class ProfileState {
	profile: Profile | null = $state(null);
	loading = $state(true);
	refreshing = $state(false);
	error: Error | null = $state(null);
	changingViewability = $state(false);
	/** The preference held the view back or sending it failed. */
	canSendView = $state(false);
	sendingView = $state(false);

	readonly profileId: number;
	readonly ourProfileId: number;

	#generation = new Generation();
	#viewabilityChanges = new Generation();
	#destroyed = false;
	#viewed = false;

	constructor({
		profileId,
		ourProfileId,
		recordView = true,
	}: {
		profileId: number;
		ourProfileId: number;
		/**
		 * Whether opening counts as viewing. The profile pager mounts the
		 * neighbouring profiles up front so a swipe has something to animate to,
		 * and sets this false for them — it calls {@link markViewed} once one is
		 * actually swiped to.
		 */
		recordView?: boolean;
	}) {
		this.profileId = profileId;
		this.ourProfileId = ourProfileId;
		if (!Number.isFinite(profileId)) {
			this.error = new ProfileUnavailableError();
			this.loading = false;
			return;
		}
		void this.#load({ refresh: false });
		if (recordView) this.markViewed();
	}

	get isOurProfile(): boolean {
		return this.profileId === this.ourProfileId;
	}

	/** Record that we looked at this profile. Idempotent. */
	markViewed(): void {
		if (this.#viewed || this.isOurProfile) return;
		this.#viewed = true;
		void this.#recordView();
	}

	async sendView(): Promise<void> {
		if (!this.canSendView || this.sendingView) return;
		this.sendingView = true;
		try {
			await recordProfileView({ profileId: this.profileId });
			this.canSendView = false;
			toast.success("Profile view sent");
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to send profile view", error });
		} finally {
			this.sendingView = false;
		}
	}

	destroy(): void {
		this.#destroyed = true;
	}

	retry(): void {
		void this.#load({ refresh: false });
	}

	refresh(): void {
		if (this.#busy) return;
		void this.#load({ refresh: true });
	}

	revalidate(): void {
		if (this.#busy) return;
		if (this.error) {
			if (!isUnviewableProfileError(this.error)) this.retry();
			return;
		}
		if (!isProfileCached(this.profileId)) this.refresh();
	}

	markBlocked(): PendingViewabilityChange {
		return this.#changeViewability({
			error: new BlockedProfileError({ blockedByUs: true }),
		});
	}

	markHidden(): PendingViewabilityChange {
		return this.#changeViewability({ error: new HiddenProfileError() });
	}

	markViewable(): PendingViewabilityChange {
		return this.#changeViewability({ error: null });
	}

	setTap(tapType: TapType | null): void {
		const { profile } = this;
		if (!profile) return;
		const tapped = tapType !== null;
		profile.tapType = tapType;
		profile.tapped = tapped;
		mergeProfileEditIntoCaches({
			cacheProfileId: profile.profileId,
			patch: { tapType, tapped },
		});
	}

	setFavorite(isFavorite: boolean): void {
		const { profile } = this;
		if (!profile) return;
		profile.isFavorite = isFavorite;
		mergeProfileEditIntoCaches({
			cacheProfileId: profile.profileId,
			patch: { isFavorite },
		});
	}

	get #busy(): boolean {
		return this.loading || this.refreshing || this.changingViewability;
	}

	#changeViewability({
		error,
	}: {
		error: Error | null;
	}): PendingViewabilityChange {
		const generation = this.#viewabilityChanges.next();
		const superseded = () => this.#viewabilityChanges.isStale(generation);
		const previous = this.error;
		this.error = error;
		this.changingViewability = true;
		return {
			revert: () => {
				if (superseded()) return;
				this.changingViewability = false;
				if (this.error === error) this.error = previous;
			},
			settle: () => {
				if (superseded()) return;
				this.changingViewability = false;
				if (!this.error && !this.profile) this.retry();
			},
		};
	}

	async #load({ refresh }: { refresh: boolean }): Promise<void> {
		if (refresh) {
			this.refreshing = true;
			invalidateProfile(this.profileId);
		} else {
			this.loading = true;
			this.error = null;
			this.profile = null;
		}
		const generation = this.#generation.next();
		const errorBeforeLoad = this.error;
		try {
			const profile = refresh
				? await refreshProfile(this.profileId)
				: await getProfile(this.profileId);
			if (this.#superseded(generation)) return;
			this.profile = profile;
			if (this.error === errorBeforeLoad) this.error = null;
			if (profile.tapped && profile.tapType === null) {
				void this.#resolveTapType(generation);
			}
		} catch (error) {
			if (this.#superseded(generation)) return;
			if (refresh && !isUnviewableProfileError(error)) {
				console.error(error);
				showErrorToast({
					label: "Failed to refresh profile",
					error,
					onRetry: () => void this.refresh(),
				});
				return;
			}
			this.error =
				error instanceof Error ? error : new Error(String(error));
			this.profile = null;
		} finally {
			if (!this.#superseded(generation)) {
				this.loading = false;
				this.refreshing = false;
			}
		}
	}

	/** A tap sent from another client can come back as tapped with no type. */
	async #resolveTapType(generation: number): Promise<void> {
		try {
			const existing = await findSentTap(this.profileId);
			if (
				!existing ||
				this.#superseded(generation) ||
				this.profile?.tapType !== null
			)
				return;
			this.setTap(existing.tapType ?? TapType.Hot);
		} catch (error) {
			console.error(error);
		}
	}

	async #recordView(): Promise<void> {
		try {
			const { revealProfileViews } = await getPreferences();
			if (!revealProfileViews) {
				this.canSendView = true;
				return;
			}
			await recordProfileView({ profileId: this.profileId });
		} catch (error) {
			this.canSendView = true;
			console.error(error);
			showErrorToast({
				label: "Failed to record profile view preference or action",
				error,
			});
		}
	}

	#superseded(generation: number): boolean {
		return this.#destroyed || this.#generation.isStale(generation);
	}
}
