import z from "zod";

import { fetchRest } from "$lib/api/transport";
import {
	type SavedPhrase,
	savedPhraseSchema,
	savedPhrasesResponseSchema,
} from "$lib/model/messaging/phrases";

export async function getSavedPhrases(): Promise<SavedPhrase[]> {
	const { phrases } = await fetchRest("/v1/chat/phrases").then((res) =>
		res.jsonParsed(savedPhrasesResponseSchema),
	);
	return phrases;
}

// The response body is documented as carrying the stored phrase, but the field
// is optional in the spec — callers that get nothing back re-read the list
// rather than inventing an id.
const createSavedPhraseResponseSchema = z.object({
	phrase: savedPhraseSchema.optional(),
});

export async function createSavedPhrase(
	text: string,
): Promise<SavedPhrase | null> {
	const res = await fetchRest("/v1/chat/phrases", {
		method: "POST",
		body: { text },
	});
	res.assertOk();
	return res.jsonParsed(createSavedPhraseResponseSchema).phrase ?? null;
}

/** The delete route stayed on the legacy prefs path; there is no v1 twin. */
export async function deleteSavedPhrase(id: string): Promise<void> {
	await fetchRest(`/v3/me/prefs/phrases/${encodeURIComponent(id)}`, {
		method: "DELETE",
	}).then((res) => res.assertOk());
}

/**
 * Counts one use of a phrase. The count does not reorder the list we read, so
 * nothing on screen depends on it — it is sent to keep the account's data
 * looking like the official client's.
 */
export async function trackSavedPhraseUsage(id: string): Promise<void> {
	await fetchRest(`/v4/phrases/frequency/${encodeURIComponent(id)}`, {
		method: "POST",
	}).then((res) => res.assertOk());
}
