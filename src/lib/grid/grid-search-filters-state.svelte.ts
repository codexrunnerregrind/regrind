import { showErrorToast } from "$lib/api/error-toast";
import { getTags } from "$lib/api/users/tags";
import {
	getPreferences,
	preferencesAccount,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import {
	defaultFilters,
	type GridSearchFilters,
	tagCatalog,
} from "$lib/model/browse/grid/filters";
import { withDeadline } from "$lib/util/deadline";
import { deepEqual } from "$lib/util/deep-equal";

const TAG_LOOKUP_DEADLINE_MS = 5_000;

export class GridSearchFiltersState {
	value: GridSearchFilters | null = $state(null);
	onQueryChange: () => void;

	#loading: Promise<void> | null = null;
	#loadedFor: number | null = null;

	constructor({ onQueryChange }: { onQueryChange: () => void }) {
		this.onQueryChange = onQueryChange;
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

	snapshot(): GridSearchFilters {
		return { ...(this.value ?? defaultFilters) };
	}

	set(gridSearchFilters: Partial<GridSearchFilters>) {
		const oldValue = this.value;
		// Patch onto the defaults while the stored filters are still loading, so
		// a filter tapped early cannot save an object missing every other key.
		const newValue = Object.assign(this.snapshot(), gridSearchFilters);
		if (!deepEqual(oldValue, newValue)) {
			this.value = newValue;
			void this.#save();
			this.onQueryChange();
		}
	}

	resetFilters() {
		this.set(defaultFilters);
	}

	/**
	 * Drops the filters on the way out of an account. `ready` reads the next
	 * account's own rather than leaving the defaults in place.
	 */
	reset() {
		this.value = null;
		this.#loading = null;
	}

	async resolveTagKeys(): Promise<void> {
		try {
			await this.#replaceTagTexts();
		} catch (error) {
			console.error(error);
		}
	}

	async #replaceTagTexts() {
		if (!this.value?.tagsEnabled || this.value.tags.length === 0) return;
		const tags = [...this.value.tags];
		const languages = await withDeadline({
			work: getTags,
			ms: TAG_LOOKUP_DEADLINE_MS,
		});
		const keys = tagCatalog({ languages }).keysOf(tags);
		if (!this.value || !deepEqual(this.value.tags, tags)) return;
		if (deepEqual(keys, tags)) return;
		this.value = { ...this.value, tags: keys };
		void this.#save();
	}

	async #load() {
		try {
			const forAccount = preferencesAccount();
			const { gridSearchFilters } = await getPreferences();
			if (forAccount !== preferencesAccount()) return;
			this.value = gridSearchFilters ?? defaultFilters;
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to load filters", error });
		}
	}

	async #save() {
		try {
			if (this.value !== null) {
				await setPreferences({ gridSearchFilters: this.value });
			}
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to update filters", error });
		}
	}
}
