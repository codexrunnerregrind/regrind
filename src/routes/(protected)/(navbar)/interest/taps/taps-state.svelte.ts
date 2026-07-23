import { showErrorToast } from "$lib/api/error";
import { getReceivedTaps } from "$lib/api/interest/taps";
import { reconciler } from "$lib/util/reconcile";
import { tapV1TapSentEventSchema, ws } from "$lib/ws.svelte";
import type { TapProfile } from "$lib/model/interest/tap-profile";

const PAGE_SIZE = 20;

// Persists the last-loaded taps across navigations so re-entering the tab shows
// content immediately (refreshed silently in the background) instead of
// flashing the loading skeletons.
let cachedTaps: TapProfile[] | null = null;

export class TapsState {
	loading = $state(true);
	refreshing = $state(false);
	error: Error | null = $state(null);
	visibleCount = $state(PAGE_SIZE);

	#all: TapProfile[] = $state([]);

	get taps(): TapProfile[] {
		return this.#all.slice(0, this.visibleCount);
	}

	get hasMore(): boolean {
		return this.visibleCount < this.#all.length;
	}

	readonly ourProfileId: number;

	#initial: Promise<void>;
	#destroyed = false;
	#unsubscribeReconcile: () => void;
	#unlistenTap: Promise<() => void>;

	constructor({ ourProfileId }: { ourProfileId: number }) {
		this.ourProfileId = ourProfileId;
		if (cachedTaps !== null) {
			this.#all = cachedTaps;
			this.loading = false;
			this.#initial = Promise.resolve();
			void this.#backgroundRefresh();
		} else {
			this.#initial = this.#initialLoad();
		}

		this.#unsubscribeReconcile = reconciler.subscribe(() => this.#reconcile());

		this.#unlistenTap = ws.on(
			"tap.v1.tap_sent",
			tapV1TapSentEventSchema,
			(event) => {
				if (this.#destroyed) return;
				const tap = event.payload;
				if (tap.recipientId !== this.ourProfileId) return;
				this.#upsert({
					distance: null,
					profileImageMediaHash: tap.senderProfileImageHash,
					isFavorite: false,
					profileId: tap.senderId,
					displayName: tap.senderDisplayName,
					timestamp: tap.timestamp,
					tapType: tap.tapType,
					lastOnline: tap.timestamp,
					isBoosting: false,
					isMutual: tap.isMutual,
					rightNowType: "",
					isViewable: true,
				});
			},
		);
	}

	destroy(): void {
		if (this.#destroyed) return;
		this.#destroyed = true;
		cachedTaps = this.#all;
		this.#unsubscribeReconcile();
		this.#unlistenTap.then((unlisten) => unlisten()).catch(console.error);
	}

	loadMore(): void {
		if (!this.hasMore) return;
		this.visibleCount += PAGE_SIZE;
	}

	retry(): void {
		this.#initial = this.#initialLoad();
	}

	refresh(): Promise<void> {
		return this.#reconcile();
	}

	#upsert(tap: TapProfile): void {
		const existing = this.#all.findIndex((t) => t.profileId === tap.profileId);
		if (existing !== -1) this.#all.splice(existing, 1);
		this.#all = [tap, ...this.#all];
		cachedTaps = this.#all;
	}

	// Refreshes cached data without toggling loading/refreshing, so a revisit
	// updates in place with no skeleton or refresh indicator.
	async #backgroundRefresh(): Promise<void> {
		try {
			const { profiles } = await getReceivedTaps();
			if (this.#destroyed) return;
			this.#all = profiles;
			cachedTaps = profiles;
		} catch {
			// Keep showing cached data on failure.
		}
	}

	async #initialLoad(): Promise<void> {
		this.loading = true;
		this.error = null;
		try {
			const { profiles } = await getReceivedTaps();
			if (this.#destroyed) return;
			this.#all = profiles;
			cachedTaps = profiles;
		} catch (err) {
			if (this.#destroyed) return;
			this.error = err instanceof Error ? err : new Error(String(err));
		} finally {
			this.loading = false;
		}
	}

	async #reconcile(): Promise<void> {
		if (this.#destroyed || this.refreshing) return;
		this.refreshing = true;
		try {
			await this.#initial.catch(() => {});
			if (this.#destroyed) return;
			const { profiles } = await getReceivedTaps();
			if (this.#destroyed) return;
			this.#all = profiles;
			cachedTaps = profiles;
			this.error = null;
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: "Failed to refresh taps",
				error,
			});
		} finally {
			this.refreshing = false;
		}
	}
}
