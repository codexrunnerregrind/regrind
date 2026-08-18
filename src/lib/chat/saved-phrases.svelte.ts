import { registerAccountCache } from "$lib/api/account-caches";
import { showErrorToast } from "$lib/api/error-toast";
import {
	createSavedPhrase,
	deleteSavedPhrase,
	getSavedPhrases,
	trackSavedPhraseUsage,
} from "$lib/api/messaging/phrases";
import type { SavedPhrase } from "$lib/model/messaging/phrases";

/**
 * The account's saved phrases, shared by every conversation's composer.
 *
 * One list answers for the whole app, so it is loaded once and kept in memory:
 * opening a chat should not cost a request, and a phrase saved in one
 * conversation has to show up in the next one without a refetch.
 *
 * Writes are optimistic. A phrase is a line of text the user just typed — if
 * the request fails the list rolls back and says so, which is cheaper than
 * making them wait on a round trip before the chip appears.
 */
export class SavedPhrasesState {
	#phrases: SavedPhrase[] = $state([]);
	#loading = $state(false);
	#loaded = false;
	#inFlight: Promise<void> | null = null;
	#pendingSeq = 0;

	get phrases(): readonly SavedPhrase[] {
		return this.#phrases;
	}

	/** True only while the first load is outstanding, so nothing flashes on a refresh. */
	get loading(): boolean {
		return this.#loading;
	}

	/** Loads the list once. Repeat callers join the request in flight. */
	async load(): Promise<void> {
		if (this.#loaded) return;
		this.#inFlight ??= this.#fetch().finally(() => {
			this.#inFlight = null;
		});
		await this.#inFlight;
	}

	async #fetch(): Promise<void> {
		this.#loading = this.#phrases.length === 0;
		try {
			this.#phrases = await getSavedPhrases();
			this.#loaded = true;
		} catch (error) {
			// Swallowed: an empty bar is a fine resting state, and the composer
			// underneath it still works. The next open retries.
			console.error(error);
		} finally {
			this.#loading = false;
		}
	}

	async add(text: string): Promise<void> {
		const trimmed = text.trim();
		if (trimmed === "") return;
		const placeholder: SavedPhrase = {
			id: `pending:${(this.#pendingSeq += 1)}`,
			text: trimmed,
			type: "user",
		};
		this.#phrases = [...this.#phrases, placeholder];
		try {
			const created = await createSavedPhrase(trimmed);
			// Without an id from the response there is nothing to delete the chip
			// by later, so the list is re-read rather than left holding a
			// placeholder id the server would reject.
			if (created === null) await this.#fetch();
			else this.#replace(placeholder.id, created);
		} catch (error) {
			this.#remove(placeholder.id);
			showErrorToast({ label: "Failed to save phrase", error });
		}
	}

	async remove(id: string): Promise<void> {
		const removed = this.#phrases.find((phrase) => phrase.id === id);
		if (removed === undefined) return;
		this.#remove(id);
		try {
			await deleteSavedPhrase(id);
		} catch (error) {
			this.#phrases = [...this.#phrases, removed];
			showErrorToast({ label: "Failed to delete phrase", error });
		}
	}

	/**
	 * There is no edit endpoint, so a rename is the new phrase created and the
	 * old one deleted. Created first: a failed create leaves the original
	 * standing, where deleting first would lose the text outright.
	 */
	async rename({ id, text }: { id: string; text: string }): Promise<void> {
		const trimmed = text.trim();
		const existing = this.#phrases.find((phrase) => phrase.id === id);
		if (
			existing === undefined ||
			trimmed === "" ||
			trimmed === existing.text
		)
			return;
		this.#replace(id, { ...existing, text: trimmed });
		try {
			const created = await createSavedPhrase(trimmed);
			if (created !== null) this.#replace(id, created);
			await deleteSavedPhrase(id);
			// The list is re-read when the create told us nothing: the renamed chip
			// is still carrying the deleted phrase's id.
			if (created === null) {
				this.#loaded = false;
				await this.load();
			}
		} catch (error) {
			this.#replace(id, existing);
			showErrorToast({ label: "Failed to rename phrase", error });
		}
	}

	/** Fire-and-forget: nothing on screen depends on the count landing. */
	use(id: string): void {
		if (id.startsWith("pending:")) return;
		trackSavedPhraseUsage(id).catch((error: unknown) =>
			console.error(error),
		);
	}

	#replace(id: string, phrase: SavedPhrase): void {
		const index = this.#phrases.findIndex(
			(candidate) => candidate.id === id,
		);
		if (index === -1) return;
		this.#phrases = this.#phrases.with(index, phrase);
	}

	#remove(id: string): void {
		this.#phrases = this.#phrases.filter((phrase) => phrase.id !== id);
	}

	reset(): void {
		this.#phrases = [];
		this.#loaded = false;
		this.#loading = false;
		this.#inFlight = null;
	}
}

export const savedPhrases = new SavedPhrasesState();

registerAccountCache({ reset: () => savedPhrases.reset() });
