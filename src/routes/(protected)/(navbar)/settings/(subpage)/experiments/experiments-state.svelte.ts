import { untrack } from "svelte";

import { getAssignmentsV3 } from "$lib/api/assignments";
import type { Assignment } from "$lib/model/assignments";

export type ExperimentFilters = {
	flags: boolean;
	experiments: boolean;
	key: string;
};

export const DefaultFilters = {
	flags: false,
	experiments: false,
	key: "",
} as const;

class ExperimentsState {
	assignments: Assignment[] = $state([]);
	loading = $state(false);
	filters: ExperimentFilters = $state({ ...DefaultFilters });
	error: Error | null = $state(null);

	#fetchToken = 0;
	#allAssignments: Assignment[] = $state([]);

	setFilters(filters: Partial<ExperimentFilters>): void {
		this.filters = { ...this.filters, ...filters };
		this.#applyFilters();
	}

	#applyFilters() {
		if (
			this.filters.flags === this.filters.experiments &&
			this.filters.key === ""
		) {
			this.assignments = this.#allAssignments;
			return;
		}
		this.assignments = this.#allAssignments.filter((assignment) => {
			if (
				this.filters.flags !== this.filters.experiments &&
				this.filters.flags &&
				assignment.type !== "FEATURE_FLAG"
			) {
				return false;
			}
			if (
				this.filters.flags !== this.filters.experiments &&
				this.filters.experiments &&
				assignment.type !== "EXPERIMENT"
			) {
				return false;
			}
			if (
				this.filters.key !== "" &&
				!assignment.key.includes(this.filters.key)
			) {
				return false;
			}

			return true;
		});
	}

	load(geohash: string): void {
		untrack(() => {
			if (this.loading) return;
			this.loading = true;
			void this.#fetchAssignments(geohash);
		});
	}

	async #fetchAssignments(geohash: string): Promise<void> {
		const token = ++this.#fetchToken;
		try {
			const response = await getAssignmentsV3({ geohash });
			if (token !== this.#fetchToken) return;
			response.assignments.sort((a, b) => (a.key < b.key ? -1 : 1));
			this.#allAssignments = response.assignments;
			this.#applyFilters();
			this.error = null;
		} catch (err) {
			if (token !== this.#fetchToken) return;
			this.error =
				err instanceof Error
					? err
					: new Error("Failed to fetch experiments", { cause: err });
		} finally {
			if (token === this.#fetchToken) this.loading = false;
		}
	}
}

export const experimentsState = new ExperimentsState();

// registerAccountCache({ reset: () => experimentsState.reset() });
