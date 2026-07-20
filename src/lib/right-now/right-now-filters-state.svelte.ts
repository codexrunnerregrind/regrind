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

		if (!isEqual(oldValue, newValue)) {
			this.value = newValue;
			void this.#save();
			this.onRefresh();
		}
	}

	resetFilters() {
		if (isEqual(this.value, defaultRightNowFilters)) {
			return;
		}
		this.set(defaultRightNowFilters);
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
