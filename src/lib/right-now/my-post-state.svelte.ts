import { registerAccountCache } from "$lib/api/account-caches";
import {
	createRightNowPost,
	getActiveRightNowPost,
	getEntitlements,
	updateRightNowPost,
} from "$lib/api/right-now";
import { getAccountPreferences } from "$lib/api/settings/account";
import { getActiveGeohashSnapshot } from "$lib/app-data/preferences.svelte";
import { decodeGeohash } from "$lib/model/geohash";
import { postExpired } from "$lib/right-now/post-expiry";
import { getNow } from "$lib/util/now";
import type { RightNowShareLocation } from "$lib/model/right-now";
import type {
	RightNowOwnPost,
	RightNowPostMedia,
} from "$lib/model/right-now/post";
import type { AccountPreferences } from "$lib/model/settings/account";

export type RightNowPostDraft = {
	text: string;
	hosting: boolean;
	media: RightNowPostMedia[];
};

/**
 * Our own Right Now post: whether the account may have one, whether one is up,
 * and the calls that put one up or take it down.
 *
 * A module singleton rather than per-mount state: the feed screen, the composer
 * sheet and the post's own card all read the same answer, and it should not be
 * refetched every time the sheet opens.
 */
class MyRightNowPostState {
	loading = $state(false);
	busy = $state(false);
	/** Whether the account is entitled to post at all. */
	allowed = $state(false);
	/** Posts left on the allowance, as the entitlement reports it. */
	remaining = $state(0);

	#post = $state<RightNowOwnPost | null>(null);
	#loaded = $state(false);
	#preferences: AccountPreferences | null = null;
	/** The post `lapse` has already refetched for, so it refetches once. */
	#refetchedFor: number | null = null;

	/**
	 * The post that is up. A lapsed one reads as no post: nothing takes it off the
	 * feed for us, and a post whose hour is over should leave the button offering
	 * a new one rather than an edit that would fail.
	 */
	get post(): RightNowOwnPost | null {
		const post = this.#post;
		if (post === null) return null;
		return postExpired({ expiration: post.expiration, nowMs: getNow() })
			? null
			: post;
	}

	get hasPost(): boolean {
		return this.post !== null;
	}

	/** Whether the allowance on screen is the API's answer or the initial zero. */
	get loaded(): boolean {
		return this.#loaded;
	}

	/** Whether the post we were holding has run out. */
	get lapsed(): boolean {
		return this.#post !== null && this.post === null;
	}

	/**
	 * Refetches when the post that was up runs out, once per post: the allowance
	 * was spent on it, so what `remaining` says by then is an hour stale and the
	 * button would read as locked with a post going spare.
	 */
	lapse(): void {
		const post = this.#post;
		if (post === null || this.loading || this.#refetchedFor === post.id) {
			return;
		}
		this.#refetchedFor = post.id;
		void this.#load();
	}

	/** Called by the feed screen on mount; only the first call fetches. */
	ensureLoaded(): void {
		if (this.#loaded || this.loading) return;
		void this.#load();
	}

	async refresh(): Promise<void> {
		await this.#load();
	}

	async #load(): Promise<void> {
		this.loading = true;
		try {
			// Independent of each other, and neither is worth the other's round
			// trip: an entitlement that fails should not hide a post that is up.
			const [entitlements, post, preferences] = await Promise.allSettled([
				getEntitlements(),
				getActiveRightNowPost(),
				// What the post reveals about where we are is not a third question to
				// ask: the account already answers it once, under privacy settings.
				getAccountPreferences(),
			]);
			if (entitlements.status === "fulfilled") {
				this.remaining = entitlements.value.rightNow;
				this.allowed = this.remaining > 0;
			} else {
				console.error(entitlements.reason);
			}
			if (post.status === "fulfilled") {
				this.#post = post.value;
			} else {
				console.error(post.reason);
			}
			if (preferences.status === "fulfilled") {
				this.#preferences = preferences.value;
			} else {
				console.error(preferences.reason);
			}
			this.#loaded = true;
		} finally {
			this.loading = false;
		}
	}

	/**
	 * What the post says about where we are, taken from the account's own privacy
	 * settings rather than asked again per post: on the map if the account is on
	 * the map, otherwise the distance alone, and nothing at all if the account has
	 * opted out of being found by location.
	 */
	get #shareLocation(): RightNowShareLocation {
		const preferences = this.#preferences;
		if (preferences?.locationSearchOptOut === true) return "NONE";
		return preferences?.showOnMap === true
			? "DISTANCE_AND_MAP"
			: "DISTANCE_ONLY";
	}

	/**
	 * Puts a post up. The location is the one the rest of the app is using, so a
	 * post agrees with the grid — including while the location is a picked one.
	 */
	async create(draft: RightNowPostDraft): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		try {
			const text = draft.text.trim();
			const geohash = getActiveGeohashSnapshot();
			// No location at all is what the API's own "NONE" means, so a post made
			// with nothing to go on is sent that way rather than with a made-up
			// point.
			const coords = geohash === null ? null : decodeGeohash(geohash);
			const created = await createRightNowPost({
				text: text === "" ? null : text,
				shareLocation: coords === null ? "NONE" : this.#shareLocation,
				lat: coords?.lat ?? null,
				lon: coords?.lon ?? null,
				// The same fuzzing the account already applies to its map pin.
				locationRadius:
					this.#preferences?.mapLocationFuzzRadius ?? null,
				media: draft.media,
				hosting: draft.hosting,
				sharedFields: [],
			});
			this.#post = created;
			if (this.remaining > 0) this.remaining -= 1;
			// Read back rather than trusting the echo: a create response we cannot
			// make sense of would otherwise leave a running post looking like no
			// post, and nothing on screen to end it with.
			if (created === null) {
				this.#post = await getActiveRightNowPost().catch(
					(error: unknown) => {
						console.error(error);
						return null;
					},
				);
			}
		} finally {
			this.busy = false;
		}
	}

	/** Changes the post that is up. */
	async update(draft: RightNowPostDraft): Promise<void> {
		const post = this.post;
		if (post === null || this.busy) return;
		this.busy = true;
		try {
			const text = draft.text.trim();
			await updateRightNowPost({
				postId: post.id,
				patch: {
					text: text === "" ? null : text,
					hosting: draft.hosting,
					shareLocation: this.#shareLocation,
					media: draft.media,
				},
			});
			this.#post = {
				...post,
				activeText: text === "" ? null : text,
				hosting: draft.hosting,
				shareLocation: this.#shareLocation,
			};
		} finally {
			this.busy = false;
		}
	}

	/**
	 * Takes the post out of the feed. `hidden` rather than a delete: the API has
	 * no endpoint for removing a post, and hiding is what the official app's
	 * "remove" does.
	 */
	async hide(): Promise<void> {
		const post = this.post;
		if (post === null || this.busy) return;
		this.busy = true;
		try {
			await updateRightNowPost({
				postId: post.id,
				patch: { hidden: true },
			});
			this.#post = null;
		} finally {
			this.busy = false;
		}
	}

	reset(): void {
		this.#post = null;
		this.#refetchedFor = null;
		this.allowed = false;
		this.remaining = 0;
		this.#preferences = null;
		this.loading = false;
		this.busy = false;
		this.#loaded = false;
	}
}

export const myRightNowPost = new MyRightNowPostState();

registerAccountCache({ reset: () => myRightNowPost.reset() });
