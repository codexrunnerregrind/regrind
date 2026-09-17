import { showErrorToast } from "$lib/api/error-toast";
import {
	getPreferences,
	preferencesAccount,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import {
	defaultRightNowFilters,
	type RightNowFilters,
} from "$lib/model/browse/grid/filters";
import { deepEqual } from "$lib/util/deep-equal";

export class RightNowSearchFiltersState {
	value: RightNowFilters | null = $state(null);
	onRefresh: () => void;

	#loading: Promise<void> | null = null;
	#loadedFor: number | null = null;

	constructor({ onRefresh }: { onRefresh: () => void }) {
		this.onRefresh = onRefresh;
		void this.ready;
	}

	/**
	 * Resolves once `value` holds the filters stored for the account in use.
	 *
	 * Reads again whenever there is nothing loaded or the load belongs to
	 * another account, so a switch picks up the filters that account was
	 * browsing with instead of keeping the previous one's in memory.
	 */
	get ready(): Promise<void> {
		if (
			this.#loading === null ||
			this.#loadedFor !== preferencesAccount()
		) {
			this.#loadedFor = preferencesAccount();
			this.#loading = this.#load();
		}
		return this.#loading;
	}

	set(rightNowFilters: Partial<RightNowFilters>) {
		const oldValue = this.value;
		// Patch onto the defaults while the stored filters are still loading, so
		// a filter tapped early cannot save an object missing every other key.
		const newValue = Object.assign(
			{ ...(oldValue ?? defaultRightNowFilters) },
			rightNowFilters,
		);

		if (!deepEqual(oldValue, newValue)) {
			this.value = newValue;
			void this.#save();
			this.onRefresh();
		}
	}

	resetFilters() {
		if (deepEqual(this.value, defaultRightNowFilters)) {
			return;
		}
		this.set(defaultRightNowFilters);
	}

	/**
	 * Drops the filters on the way out of an account. `ready` reads the next
	 * account's own rather than leaving the defaults in place.
	 */
	reset() {
		this.value = null;
		this.#loading = null;
	}

	async #load() {
		try {
			const forAccount = preferencesAccount();
			const { rightNowFilters } = await getPreferences();
			if (forAccount !== preferencesAccount()) return;
			this.value = rightNowFilters ?? defaultRightNowFilters;
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to load filters", error });
		}
	}

	async #save() {
		try {
			if (this.value !== null) {
				await setPreferences({ rightNowFilters: this.value });
			}
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to update filters", error });
		}
	}
}
