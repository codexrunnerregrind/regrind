import { accountScoped } from "$lib/api/account-caches";
import { markBlockedProfilesUnviewable } from "$lib/api/browse/blocks";
import { markHiddenProfilesUnviewable } from "$lib/api/browse/hides";
import { showErrorToast } from "$lib/api/error-toast";
import { getViews } from "$lib/api/interest/views";
import {
	getAccountPreferences,
	setAccountPreferences,
} from "$lib/api/settings/account";
import {
	isProfileViewable,
	onProfileViewabilityChange,
} from "$lib/api/users/profile-viewability";
import { getProfiles, onProfileEdit } from "$lib/api/users/profiles";
import { matchViewers, notePhotos } from "$lib/interest/viewer-matches";
import { ReconcilingListState } from "$lib/util/reconciling-list-state.svelte";
import { viewedMeV1NewViewReceivedEventSchema, ws } from "$lib/ws.svelte";
import type { ViewerProfile, ViewPreview } from "$lib/model/interest/views";

const PAGE_SIZE = 24;

type ViewsSnapshot = {
	profiles: ViewerProfile[];
	/** Blurred previews put back to a face by viewer-matches. */
	matched: ViewerProfile[];
	previews: ViewPreview[];
	viewedMeHidden: boolean;
};

// Persists the last-loaded views across navigations so re-entering the tab
// shows content immediately (refreshed silently in the background) instead of
// flashing the loading skeletons.
let cached: ViewsSnapshot | null = null;

export function resetViewsCacheForTesting(): void {
	cached = null;
}

export type ViewGridEntry =
	| { type: "profile"; key: string; profile: ViewerProfile }
	| { type: "matched"; key: string; viewer: ViewerProfile }
	| { type: "preview"; key: string; preview: ViewPreview };

function lastViewedOf(entry: ViewGridEntry): number | null {
	switch (entry.type) {
		case "profile":
			return entry.profile.lastViewed;
		case "matched":
			return entry.viewer.lastViewed;
		case "preview":
			return entry.preview.lastViewed;
	}
}

export class ViewsState extends ReconcilingListState<
	ViewerProfile,
	ViewsSnapshot
> {
	enablingViewedMe = $state(false);

	#profiles: ViewerProfile[] = $state([]);
	#matched: ViewerProfile[] = $state([]);
	#previews: ViewPreview[] = $state([]);
	#viewedMeHidden = $state(false);
	#unsubscribeProfileEdits = onProfileEdit(({ profileId, patch }) => {
		if (patch.isFavorite === undefined) return;
		this.setFavorite({ profileId, isFavorite: patch.isFavorite });
	});
	#unsubscribeViewability = onProfileViewabilityChange(
		({ profileId, viewable }) => {
			if (viewable) {
				void this.refresh();
				return;
			}
			this.#profiles = this.#profiles.filter(
				(view) => view.profileId !== profileId,
			);
			this.#matched = this.#matched.filter(
				(viewer) => viewer.profileId !== profileId,
			);
		},
	);

	constructor() {
		super({
			pageSize: PAGE_SIZE,
			refreshErrorLabel: "Failed to refresh views",
		});
		this.start();
	}

	setFavorite({
		profileId,
		isFavorite,
	}: {
		profileId: number;
		isFavorite: boolean;
	}): void {
		const index = this.#profiles.findIndex(
			(v) => v.profileId === profileId,
		);
		const profile = this.#profiles[index];
		if (!profile) return;
		this.#profiles = this.#profiles.with(index, { ...profile, isFavorite });
	}

	get viewedMeHidden(): boolean {
		return this.#viewedMeHidden;
	}

	async enableViewedMeTracking(): Promise<void> {
		if (this.enablingViewedMe) return;
		this.enablingViewedMe = true;
		try {
			await setAccountPreferences({ hideViewedMe: false });
			await this.refresh();
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: "Failed to turn on the Viewed Me List",
				error,
			});
		} finally {
			this.enablingViewedMe = false;
		}
	}

	get views(): ViewGridEntry[] {
		const entries: ViewGridEntry[] = [
			...this.#profiles.map(
				(profile): ViewGridEntry => ({
					type: "profile",
					key: `profile:${profile.profileId}`,
					profile,
				}),
			),
			...this.#matched.map(
				(viewer): ViewGridEntry => ({
					type: "matched",
					key: `matched:${viewer.profileId}`,
					viewer,
				}),
			),
			...this.#previews.map(
				(preview, index): ViewGridEntry => ({
					type: "preview",
					key: `preview:${index}`,
					preview,
				}),
			),
		];
		// Newest view first, whichever kind of tile it is.
		entries.sort((a, b) => (lastViewedOf(b) ?? 0) - (lastViewedOf(a) ?? 0));
		return entries.slice(0, this.visibleCount);
	}

	/** Everyone who viewed us, the anonymous previews included. */
	get total(): number {
		return this.length;
	}

	protected get length(): number {
		return (
			this.#profiles.length + this.#matched.length + this.#previews.length
		);
	}

	protected loadCache(): ViewsSnapshot | null {
		return cached;
	}

	protected async fetch(): Promise<ViewsSnapshot> {
		void markBlockedProfilesUnviewable().catch((error) =>
			console.error(error),
		);
		void markHiddenProfilesUnviewable().catch((error) =>
			console.error(error),
		);
		const views = await getViews();
		notePhotos(
			views.profiles.map((profile) => ({
				profileId: profile.profileId,
				hash: profile.profileImageMediaHash,
				displayName: profile.displayName,
			})),
		);
		const { matched, previews } = await this.#matchPreviews(views);
		const listed = views.profiles.length + views.previews.length;
		return {
			profiles: views.profiles,
			matched,
			previews,
			viewedMeHidden: listed > 0 ? false : await this.#readHideViewedMe(),
		};
	}

	async #matchPreviews({
		profiles,
		previews,
	}: {
		profiles: ViewerProfile[];
		previews: ViewPreview[];
	}): Promise<{ matched: ViewerProfile[]; previews: ViewPreview[] }> {
		const matches = await matchViewers(
			previews.map((preview) => ({
				hash: preview.profileImageMediaHash,
				lastViewed: preview.lastViewed,
			})),
		).catch((error: unknown) => {
			console.error(error);
			return previews.map(() => null);
		});
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local scratch set
		const listed = new Set(profiles.map((profile) => profile.profileId));
		const candidates: { preview: ViewPreview; profileId: number }[] = [];
		const unmatched: ViewPreview[] = [];
		previews.forEach((preview, index) => {
			const match = matches[index];
			if (!match) {
				unmatched.push(preview);
			} else if (!listed.has(match.profileId)) {
				listed.add(match.profileId);
				candidates.push({ preview, profileId: match.profileId });
			}
		});
		if (candidates.length === 0)
			return { matched: [], previews: unmatched };

		// The match only knows an id; the profile itself has the name, the
		// current photo and the online dot. One missing from the answer is gone
		// or hidden from us, so it stays blurred.
		const resolved = await getProfiles(
			candidates.map((candidate) => candidate.profileId),
		).catch((error: unknown) => {
			console.error(error);
			return null;
		});
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local lookup
		const byId = new Map(resolved?.map((p) => [p.profileId, p]));
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local lookup
		const names = new Map(
			matches.flatMap((match) =>
				match ? [[match.profileId, match.displayName] as const] : [],
			),
		);
		const matched: ViewerProfile[] = [];
		for (const { preview, profileId } of candidates) {
			const profile = byId.get(profileId);
			if (resolved && !profile) {
				unmatched.push(preview);
				continue;
			}
			matched.push({
				...preview,
				profileId,
				displayName:
					profile?.displayName ?? names.get(profileId) ?? null,
				profileImageMediaHash:
					profile?.medias?.[0]?.mediaHash ??
					preview.profileImageMediaHash,
				distance: preview.distance ?? profile?.distance ?? null,
				onlineUntil: profile?.onlineUntil ?? null,
			});
		}
		return { matched, previews: unmatched };
	}

	async #readHideViewedMe(): Promise<boolean> {
		try {
			return (await getAccountPreferences()).hideViewedMe;
		} catch (error) {
			console.error(error);
			return this.#viewedMeHidden;
		}
	}

	protected applySnapshotReturningCoveredKeys(
		snapshot: ViewsSnapshot,
	): Set<number> {
		this.#profiles = snapshot.profiles.filter((view) =>
			isProfileViewable(view.profileId),
		);
		this.#matched = snapshot.matched.filter((viewer) =>
			isProfileViewable(viewer.profileId),
		);
		this.#previews = snapshot.previews;
		this.#viewedMeHidden = snapshot.viewedMeHidden;
		cached = snapshot;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- caller only reads .has() then drops it
		return new Set(
			[...snapshot.profiles, ...snapshot.matched].map(
				(profile) => profile.profileId,
			),
		);
	}

	protected applyUpsert(fresh: ViewerProfile): void {
		if (!isProfileViewable(fresh.profileId)) return;
		const prev = this.#takeTileOf(fresh);
		let next = fresh;
		if (prev) {
			next = {
				...prev,
				...fresh,
				displayName: fresh.displayName ?? prev.displayName,
				profileImageMediaHash:
					fresh.profileImageMediaHash ?? prev.profileImageMediaHash,
				distance: fresh.distance ?? prev.distance,
				onlineUntil: fresh.onlineUntil ?? prev.onlineUntil,
				isFavorite: prev.isFavorite,
				viewedCount: {
					...prev.viewedCount,
					totalCount: prev.viewedCount.totalCount + 1,
				},
			};
		}
		this.#profiles = [next, ...this.#profiles];
		cached = {
			profiles: this.#profiles,
			matched: this.#matched,
			previews: this.#previews,
			viewedMeHidden: this.#viewedMeHidden,
		};
	}

	/**
	 * Removes and returns the tile already standing for this viewer, so a live
	 * view moves it to the top instead of adding a second one. A blurred preview
	 * is only recognized by its photo hash.
	 */
	#takeTileOf(fresh: ViewerProfile): ViewerProfile | null {
		const listed = this.#profiles.find(
			(v) => v.profileId === fresh.profileId,
		);
		if (listed) {
			this.#profiles = this.#profiles.filter((v) => v !== listed);
			return listed;
		}
		const matched = this.#matched.find(
			(v) => v.profileId === fresh.profileId,
		);
		if (matched) {
			this.#matched = this.#matched.filter((v) => v !== matched);
			return matched;
		}
		const hash = fresh.profileImageMediaHash;
		const preview =
			hash === null
				? undefined
				: this.#previews.find((p) => p.profileImageMediaHash === hash);
		if (!preview) return null;
		this.#previews = this.#previews.filter((p) => p !== preview);
		return {
			...preview,
			profileId: fresh.profileId,
			displayName: null,
			onlineUntil: null,
		};
	}

	protected keyOf(view: ViewerProfile): number {
		return view.profileId;
	}

	override destroy(): void {
		this.#unsubscribeProfileEdits();
		this.#unsubscribeViewability();
		super.destroy();
	}

	protected subscribeEvents(): Promise<() => void> {
		return ws.on(
			"viewed_me.v1.new_view_received",
			viewedMeV1NewViewReceivedEventSchema,
			(event) => {
				const recent = event.payload.mostRecent;
				if (!recent) return;
				this.upsert({
					profileId: recent.profileId,
					displayName: null,
					profileImageMediaHash: recent.photoHash ?? null,
					distance: null,
					onlineUntil: null,
					lastViewed: recent.timestamp,
					isSecretAdmirer: false,
					isFavorite: false,
					viewedCount: { totalCount: 1, maxDisplayCount: 99 },
				});
			},
		);
	}
}

export const getViewsState = accountScoped(() => new ViewsState());
