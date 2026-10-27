import { untrack } from "svelte";

import { registerAccountCache } from "$lib/api/account-caches";
import { showErrorToast } from "$lib/api/error-toast";
import { getMatchesV1 } from "$lib/api/interest/matches";
import type { MatchesMatch } from "$lib/model/interest/matches";

const PAGE_SIZE = 30;

class MatchesState {
	matches: MatchesMatch[] = $state([]);
	loading = $state(false);
	refreshing = $state(false);
	error: Error | null = $state(null);
	serverTotal = $state(0);
	/** A first page has arrived, so `serverTotal` is real. */
	loaded = $state(false);
	#nextCursor: string | null = $state(null);

	#fetchToken = 0;

	scrollY = 0;

	load(): void {
		// Called from effects: nothing read or written here may become a dependency.
		untrack(() => {
			if (this.loaded || this.loading) return;
			void this.refresh();
		});
	}

	/** Keeps the list on screen while the first page reloads. */
	async refresh(): Promise<void> {
		if (this.refreshing) return;
		if (this.matches.length === 0) {
			this.#reset();
			this.loading = true;
			await this.#fetchPage();
			return;
		}
		this.refreshing = true;
		try {
			await this.#fetchPage();
		} finally {
			this.refreshing = false;
		}
	}

	get hasMore(): boolean {
		return this.#nextCursor !== null;
	}

	loadMore(): void {
		if (this.loading || this.refreshing || this.#nextCursor === null)
			return;
		this.loading = true;
		void this.#fetchPage(this.#nextCursor);
	}

	reset(): void {
		this.#reset();
		this.refreshing = false;
		this.scrollY = 0;
	}

	#reset(): void {
		this.#fetchToken += 1;
		this.matches = [];
		this.loading = false;
		this.error = null;
		this.#nextCursor = null;
		this.serverTotal = 0;
		this.loaded = false;
	}

	async #fetchPage(cursor?: string): Promise<void> {
		const token = ++this.#fetchToken;
		try {
			const response = await getMatchesV1({
				limit: PAGE_SIZE,
				withProfileDetail: true,
				...(cursor && { cursor }),
			});
			if (token !== this.#fetchToken) return;
			this.matches = cursor
				? this.matches.concat(response.matches)
				: response.matches;
			this.error = null;
			this.serverTotal = response.total;
			this.loaded = true;
			this.#nextCursor = response.nextCursor;
		} catch (err) {
			if (token !== this.#fetchToken) return;
			if (this.matches.length > 0) {
				showErrorToast({ label: "Failed to load matches", error: err });
			} else {
				this.error =
					err instanceof Error
						? err
						: new Error("Failed to fetch matches", { cause: err });
			}
		} finally {
			if (token === this.#fetchToken) this.loading = false;
		}
	}
}

export const matchesState = new MatchesState();

registerAccountCache({ reset: () => matchesState.reset() });
