import { untrack } from "svelte";
import z from "zod";

import { registerAccountCache } from "$lib/api/account-caches";
import type { rightNowV4QuerySchema } from "$lib/model/right-now/feed/query/v4";
import { getPosts, type FeedPost } from "./posts";
import { RightNowSearchFiltersState } from "./right-now-filters-state.svelte";

class RightNowState {
	filters = new RightNowSearchFiltersState({ onRefresh: () => this.refresh() });
	posts: FeedPost[] = $state([]);
	loading = $state(false);
	refreshing = $state(false);
	error: Error | null = $state(null);

	#fetchToken = 0;

	scrollY = 0;

	load(): void {
		if (untrack(() => this.posts.length > 0)) return;
		this.#reset();
		this.scrollY = 0;
		void this.#fetchPosts();
	}

	refresh(): void {
		this.#reset();
		this.scrollY = 0;
		void this.#fetchPosts();
	}

	async reload(): Promise<void> {
		if (this.refreshing) return;
		this.refreshing = true;
		try {
			await this.#fetchPosts();
		} finally {
			this.refreshing = false;
		}
	}

	#reset(): void {
		this.#fetchToken += 1;
		this.posts = [];
		this.loading = true;
		this.error = null;
	}

	reset(): void {
		this.#reset();
		this.loading = false;
		this.refreshing = false;
		this.scrollY = 0;
		this.filters.reset();
	}

	async #fetchPosts(): Promise<void> {
		const token = ++this.#fetchToken;
		try {
			await this.filters.ready;
			if (token !== this.#fetchToken) return;
			const filters = this.filters.value;
			const query = {
				sort: filters?.sort || "DISTANCE",
				...(filters?.hostingEnabled && {
					hosting: filters?.hosting,
				}),
				...(filters?.positionEnabled && {
					sexualPositions: filters?.positions,
				}),
				...(filters?.ageEnabled && {
					ageMin: filters?.age[0],
					ageMax: filters?.age[1],
				}),
			} satisfies z.infer<typeof rightNowV4QuerySchema>;
			const posts = await getPosts(query);
			if (token !== this.#fetchToken) return;
			this.posts = posts;
			this.error = null;
			this.loading = false;
		} catch (err) {
			if (token !== this.#fetchToken) return;
			this.error =
				err instanceof Error
					? err
					: new Error("Failed to fetch Right Now feed", { cause: err });
			this.loading = false;
		}
	}
}

export const rightNowState = new RightNowState();

registerAccountCache(() => rightNowState.reset());
