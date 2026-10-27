import { untrack } from "svelte";

import { registerAccountCache } from "$lib/api/account-caches";
import { showErrorToast } from "$lib/api/error-toast";
import { getMatchesV1 } from "$lib/api/interest/matches";
import type { MatchesMatch, MatchesQuery } from "$lib/model/interest/matches";

const PAGE_SIZE = 30;

class MatchesState {
	matches: MatchesMatch[] = $state([]);
	loading = $state(false);
	refreshing = $state(false);
	error: Error | null = $state(null);
	serverTotal = $state(0);

	#fetchToken = 0;
	#nextCursor: string | null = null;

	scrollY = 0;

	load(): void {
		if (untrack(() => this.matches.length > 0)) return;
		this.#reset();
		this.scrollY = 0;
		void this.#fetchMatches();
	}

	refresh(): void {
		this.#reset();
		this.scrollY = 0;
		void this.#fetchMatches();
	}

	async reload(): Promise<void> {
		if (this.refreshing) return;
		this.refreshing = true;
		try {
			await this.#fetchMatches(true);
		} finally {
			this.refreshing = false;
		}
	}

	#reset(): void {
		this.#fetchToken += 1;
		this.matches = [];
		this.loading = true;
		this.error = null;
		this.#nextCursor = null;
		this.serverTotal = 0;
	}

	reset(): void {
		this.#reset();
		this.loading = false;
		this.refreshing = false;
		this.scrollY = 0;
	}

	get hasMore(): boolean {
		return this.matches.length < this.serverTotal;
	}

	loadMore() {
		if (!this.hasMore || !this.#nextCursor) return;
		this.loading = true;
		void this.#fetchMatches(true, this.#nextCursor);
	}

	async #fetchMatches(silent = false, cursor?: string): Promise<void> {
		const token = ++this.#fetchToken;
		try {
			if (token !== this.#fetchToken) return;

			const query: MatchesQuery = {
				limit: PAGE_SIZE,
				withProfileDetail: true,
				...(cursor && { cursor }),
			};
			const response = await getMatchesV1(query);
			if (token !== this.#fetchToken) return;
			if (cursor) {
				this.matches = this.matches.concat(response.matches);
			} else {
				this.matches = response.matches;
			}
			this.error = null;
			this.loading = false;
			this.serverTotal = response.total;
			this.#nextCursor = response.nextCursor;
		} catch (err) {
			if (token !== this.#fetchToken) return;
			if (silent) {
				showErrorToast({
					label: "Failed to refresh Matches",
					error: err,
				});
				return;
			}
			this.error =
				err instanceof Error
					? err
					: new Error("Failed to fetch Matches", { cause: err });
			this.loading = false;
		}
	}
}

export const matchesState = new MatchesState();

registerAccountCache({ reset: () => matchesState.reset() });
