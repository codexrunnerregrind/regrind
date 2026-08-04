import { fetchRest } from "$lib/api";
import {
	type FavoriteNoteContent,
	favoriteNoteContentSchema,
	favoriteNotesResponseSchema,
} from "$lib/model/users/favorites";
import type { Profile } from "$lib/model/users/profiles";

// Lists every favorited profile (online or offline, regardless of location),
// each with the note attached to it. Only the target profile id comes back, so
// callers hydrate the full profiles separately.
export async function getFavoriteNotes() {
	return await fetchRest("/v1/favorites/notes").then((res) =>
		res.jsonParsed(favoriteNotesResponseSchema),
	);
}

export async function addFavoriteUser({
	profileId,
}: {
	profileId: Profile["profileId"];
}) {
	await fetchRest(`/v3/me/favorites/${profileId}`, {
		method: "POST",
	}).then((res) => res.assertOk());
}

export async function removeFavoriteUser({
	profileId,
}: {
	profileId: Profile["profileId"];
}) {
	await fetchRest(`/v3/me/favorites/${profileId}`, {
		method: "DELETE",
	}).then((res) => res.assertOk());
}

// The note attached to one favorite, read straight from the server. A favorite
// with no note has been documented to answer 404 rather than an empty note, so
// that case comes back as `null` instead of failing.
export async function getFavoriteNote({
	profileId,
}: {
	profileId: Profile["profileId"];
}) {
	return await fetchRest(`/v1/favorites/notes/${profileId}`).then((res) => {
		if (res.status === 404) return null;
		res.assertOk();
		// Content only: this response carries no `counterpartyId`, unlike the
		// entries in the list response.
		return res.jsonParsed(favoriteNoteContentSchema);
	});
}

// Creates the note if there is none yet, replaces it otherwise. Notes only
// exist for profiles that are already favorited. The response is an empty 204,
// so callers that need to be sure read the note back.
export async function setFavoriteNote({
	profileId,
	note,
}: {
	profileId: Profile["profileId"];
	note: FavoriteNoteContent;
}) {
	await fetchRest(`/v1/favorites/notes/${profileId}`, {
		method: "PUT",
		body: {
			counterpartyId: profileId,
			notes: note.notes,
			phoneNumber: note.phoneNumber,
		},
	}).then((res) => res.assertOk());
}

export async function deleteFavoriteNote({
	profileId,
}: {
	profileId: Profile["profileId"];
}) {
	await fetchRest(`/v1/favorites/notes/${profileId}`, {
		method: "DELETE",
	}).then((res) => res.assertOk());
}
