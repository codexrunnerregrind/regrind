import { isEqual } from "lodash-es";

import { showErrorToast } from "$lib/api/error";
import {
	getPreferences,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import {
	defaultRightNowFilters,
	type RightNowFilters,
} from "$lib/components/filters/filters";

export class RightNowSearchFiltersState {
	value: RightNowFilters | null = $state(null);
	onRefresh: () => void;
	ready: Promise<void>;

	constructor({ onRefresh }: { onRefresh: () => void }) {
		this.onRefresh = onRefresh;
		this.ready = this.#load();
	}

	set(rightNowFilters: Partial<RightNowFilters>) {
		const oldValue = this.value;
		const newValue = Object.assign({}, oldValue, rightNowFilters);

		//TODO: Changing a filter value whne it's not enabled causes refresh.
		//      Refresh should happen only when a value for an enabled filter changes
		if (!isEqual(oldValue, newValue)) {
			this.value = newValue;
			void this.#save();
			this.onRefresh();
		}
	}

	resetFilters() {
		this.set(defaultRightNowFilters);
		void this.#save();
	}

	reset() {
		this.value = { ...defaultRightNowFilters };
	}

	async #load() {
		try {
			const { rightNowFilters } = await getPreferences();
			this.value = rightNowFilters ?? defaultRightNowFilters;
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: "Failed to load filters",
				error,
			});
		}
	}

	async #save() {
		try {
			if (this.value !== null) {
				await setPreferences({ rightNowFilters: this.value });
			}
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: "Failed to update filters",
				error,
			});
		}
	}
}
