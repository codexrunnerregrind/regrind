import { accountScoped, registerAccountCache } from "$lib/api/account-caches";
import { getSentTaps } from "$lib/api/interest/taps";
import {
	isProfileViewable,
	onProfileViewabilityChange,
} from "$lib/api/users/profile-viewability";
import { getProfiles, onProfileEdit } from "$lib/api/users/profiles";
import { ReconcilingListState } from "$lib/util/reconciling-list-state.svelte";
import type { SentTapProfile } from "$lib/model/interest/sent-tap";

const PAGE_SIZE = 20;

type SentTapsSnapshot = { taps: SentTapProfile[] };

// Same reasoning as the received list: re-entering the tab shows the last load
// straight away and catches up in the background.
let cachedSentTaps: SentTapProfile[] | null = null;

export function resetSentTapsCacheForTesting(): void {
	cachedSentTaps = null;
}

registerAccountCache({
	reset: () => {
		cachedSentTaps = null;
	},
});

export class SentTapsState extends ReconcilingListState<
	SentTapProfile,
	SentTapsSnapshot
> {
	#all: SentTapProfile[] = $state([]);
	#unsubscribeViewability = onProfileViewabilityChange(
		({ profileId, viewable }) => {
			if (viewable) {
				void this.refresh();
				return;
			}
			this.#all = this.#all.filter((tap) => tap.profileId !== profileId);
		},
	);
	#unsubscribeProfileEdits = onProfileEdit(({ profileId, patch }) => {
		if (patch.isFavorite === undefined) return;
		const index = this.#all.findIndex((tap) => tap.profileId === profileId);
		const tap = this.#all[index];
		if (!tap) return;
		this.#all = this.#all.with(index, {
			...tap,
			isFavorite: patch.isFavorite,
		});
	});

	constructor() {
		super({
			pageSize: PAGE_SIZE,
			refreshErrorLabel: "Failed to refresh sent taps",
		});
		this.start();
	}

	get taps(): SentTapProfile[] {
		return this.#all.slice(0, this.visibleCount);
	}

	/** How many taps we have sent, whatever is on screen so far. */
	get total(): number {
		return this.#all.length;
	}

	protected get length(): number {
		return this.#all.length;
	}

	protected loadCache(): SentTapsSnapshot | null {
		return cachedSentTaps === null ? null : { taps: cachedSentTaps };
	}

	protected async fetch(): Promise<SentTapsSnapshot> {
		const sent = await getSentTaps();
		// Newest first, the order the received list is already in. A tap the API
		// marks deleted is one we took back; it is not history to show.
		const live = sent
			.filter((tap) => !tap.deleted)
			.toSorted((a, b) => b.sentOn - a.sentOn);
		// One row per person, like the received list: tapping someone twice is one
		// entry showing the last tap, not two rows of the same face.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a local lookup, built and dropped inside this fetch
		const newest = new Map<number, (typeof live)[number]>();
		for (const tap of live) {
			if (!newest.has(tap.receiverId)) newest.set(tap.receiverId, tap);
		}
		const profiles = await getProfiles([...newest.keys()]);
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- as above: nothing reads this after the snapshot is built
		const byId = new Map(
			profiles.map((profile) => [profile.profileId, profile]),
		);
		const taps: SentTapProfile[] = [];
		for (const tap of newest.values()) {
			const profile = byId.get(tap.receiverId);
			// Blocked us, deleted their account, or hidden on our side: there is
			// no profile to open, so the row would go nowhere.
			if (!profile) continue;
			taps.push({
				profileId: profile.profileId,
				displayName: profile.displayName,
				onlineUntil: profile.onlineUntil ?? null,
				distance: profile.distance,
				profileImageMediaHash: profile.profileImageMediaHash,
				isFavorite: profile.isFavorite,
				tapType: tap.tapType,
				sentOn: tap.sentOn,
				readOn: tap.readOn,
			});
		}
		return { taps };
	}

	protected applySnapshotReturningCoveredKeys(
		snapshot: SentTapsSnapshot,
	): Set<number> {
		this.#all = snapshot.taps.filter((tap) =>
			isProfileViewable(tap.profileId),
		);
		cachedSentTaps = this.#all;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- caller only reads .has() then drops it
		return new Set(snapshot.taps.map((tap) => tap.profileId));
	}

	protected applyUpsert(tap: SentTapProfile): void {
		this.#all = [tap, ...this.#all];
		cachedSentTaps = this.#all;
	}

	protected keyOf(tap: SentTapProfile): number {
		return tap.profileId;
	}

	override destroy(): void {
		this.#unsubscribeViewability();
		this.#unsubscribeProfileEdits();
		super.destroy();
	}

	/**
	 * Nothing to listen to: the API sends no event for our own taps. The list
	 * catches up on its next visit, which refreshes what it seeded from the cache.
	 */
	protected subscribeEvents(): Promise<() => void> {
		return Promise.resolve(() => {});
	}
}

export const getSentTapsState = accountScoped(() => new SentTapsState());
