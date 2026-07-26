import { fetchRest } from "$lib/api";
import { favoriteNotesResponseSchema } from "$lib/model/users/favorites";
import type { Profile } from "$lib/model/users/profiles";

// Lists every favorited profile (online or offline, regardless of location).
// Each entry only carries the target profile id, so callers hydrate the full
// profiles separately.
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
