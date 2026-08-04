import z from "zod";

// The note itself, as `GET /v1/favorites/notes/{profileId}` returns it: the
// per-profile response carries no id, only the text and phone number, despite
// the API docs describing it as the same shape the list uses.
export const favoriteNoteContentSchema = z.object({
	notes: z
		.string()
		.nullish()
		.transform((value) => value ?? ""),
	phoneNumber: z
		.string()
		.nullish()
		.transform((value) => value ?? ""),
});

// `GET /v1/favorites/notes` returns one entry per favorited profile: the note
// plus the profile it belongs to. The full profile has to be hydrated
// separately via `getProfiles`.
export const favoriteNoteSchema = z.object({
	...favoriteNoteContentSchema.shape,
	counterpartyId: z.coerce.number().int().nonnegative(),
});

export type FavoriteNote = z.infer<typeof favoriteNoteSchema>;

export const favoriteNotesResponseSchema = z.array(favoriteNoteSchema);

/** The note and phone number as they are edited, without the target id. */
export type FavoriteNoteContent = Pick<FavoriteNote, "notes" | "phoneNumber">;

// The API takes longer values silently, so the limits below are the official
// app's, kept client-side to stay interoperable with it.
export const FAVORITE_NOTE_MAX_LENGTH = 250;
export const FAVORITE_NOTE_PHONE_MAX_LENGTH = 25;

export function favoriteNoteIsEmpty(note: FavoriteNoteContent): boolean {
	return note.notes.trim() === "" && note.phoneNumber.trim() === "";
}
