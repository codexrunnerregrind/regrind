/**
 * Waiting out a clip's transcode.
 *
 * A clip is transcoded on Grindr's side after the upload, and until that is
 * done the API serves no poster, no playable media, and refuses to delete or
 * reorder it. The album read says which items are in that state, so it is
 * re-read until none are.
 *
 * Bounded because an item can sit in `processing` indefinitely — a clip the API
 * never finishes with stays that way — and polling for it forever costs the
 * battery for nothing. Reopening the album starts the count again.
 */
const MAX_POLLS = 10;
const POLL_INTERVAL_MS = 6000;

export class AlbumProcessingPoll {
	#polls = $state(0);

	/** Called when the album is (re)opened, which starts the count again. */
	reset(): void {
		this.#polls = 0;
	}

	/**
	 * Schedules the next re-read while anything is still processing, and hands
	 * back the teardown the effect needs. Returns undefined when there is
	 * nothing left to wait for, or when the count is spent.
	 */
	schedule({
		processing,
		refresh,
	}: {
		processing: boolean;
		refresh: () => void;
	}): (() => void) | undefined {
		if (!processing || this.#polls >= MAX_POLLS) return undefined;
		const timer = setTimeout(() => {
			this.#polls += 1;
			refresh();
		}, POLL_INTERVAL_MS);
		return () => clearTimeout(timer);
	}
}
