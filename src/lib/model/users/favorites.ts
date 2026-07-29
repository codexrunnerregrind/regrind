import z from "zod";

// `GET /v1/favorites/notes` returns one entry per favorited profile. The entry
// only carries the target profile id (and any note/phone the user attached);
// the full profile has to be hydrated separately via `getProfiles`.
export const favoriteNoteSchema = z.object({
	counterpartyId: z.coerce.number().int().nonnegative(),
	notes: z
		.string()
		.nullish()
		.transform((value) => value ?? ""),
	phoneNumber: z
		.string()
		.nullish()
		.transform((value) => value ?? ""),
});

export type FavoriteNote = z.infer<typeof favoriteNoteSchema>;

export const favoriteNotesResponseSchema = z.array(favoriteNoteSchema);
