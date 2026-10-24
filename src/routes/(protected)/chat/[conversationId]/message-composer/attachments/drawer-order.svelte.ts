import { untrack } from "svelte";

import {
	forgetMediaSends,
	rememberMediaSends,
} from "$lib/app-data/media-sends";
import {
	getAlbumGridColumnsSnapshot,
	getMediaSendsSnapshot,
	getSortMediaByFrequencySnapshot,
} from "$lib/app-data/preferences.svelte";
import { arrangeMedia } from "$lib/model/media-sends";
import type { DrawerMedia } from "$lib/api/messaging/drawer";

/**
 * Orders the chat media sheet: the drawer's own order, or the most sent first.
 * Ranked once per load so tiles never move under a pick, except when the sort
 * itself is switched.
 */
export class DrawerOrder {
	#serverOrder: number[] = [];
	#current: () => DrawerMedia[] | null;

	constructor(
		current: () => DrawerMedia[] | null,
		replace: (items: DrawerMedia[]) => void,
	) {
		this.#current = current;
		let sorted: boolean | null = null;
		$effect(() => {
			const next = getSortMediaByFrequencySnapshot();
			if (sorted !== null && sorted !== next) {
				untrack(() => {
					const items = current();
					if (items !== null) replace(this.#arrange(items, null));
				});
			}
			sorted = next;
		});
	}

	/** Arranges a fresh drawer read; anything new since the last one leads. */
	fetched(items: DrawerMedia[]): DrawerMedia[] {
		this.#serverOrder = items.map((item) => item.id);
		return this.#arrange(
			items,
			untrack(() => this.#current()),
		);
	}

	sent(items: DrawerMedia[]) {
		void rememberMediaSends(items.map((item) => item.id)).catch(
			console.error,
		);
	}

	deleted(id: number) {
		void forgetMediaSends([id]).catch(console.error);
	}

	#arrange(
		items: DrawerMedia[],
		previous: DrawerMedia[] | null,
	): DrawerMedia[] {
		return arrangeMedia(items, {
			serverOrder: this.#serverOrder,
			previous,
			sends: getSortMediaByFrequencySnapshot()
				? getMediaSendsSnapshot()
				: null,
			now: Date.now(),
			limit: getAlbumGridColumnsSnapshot() * 2,
		});
	}
}
