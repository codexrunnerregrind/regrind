import z from "zod";

/**
 * A phrase saved to the account for reuse in the composer.
 *
 * `type` is the server's own classification — everything the account saved
 * itself comes back as `"user"`, but the field is free-form, so it is carried
 * as a string rather than narrowed to what we have seen.
 */
export const savedPhraseSchema = z.object({
	id: z.string(),
	text: z.string(),
	type: z.string(),
});

export const savedPhrasesResponseSchema = z.object({
	phrases: z.array(savedPhraseSchema),
});

export type SavedPhrase = z.infer<typeof savedPhraseSchema>;

/**
 * The official client stops accepting input at 255 characters. The server has
 * not been observed rejecting longer text, so this is a client-side guard that
 * keeps a phrase to something a chip can plausibly hold.
 */
export const SAVED_PHRASE_MAX_LENGTH = 255;
