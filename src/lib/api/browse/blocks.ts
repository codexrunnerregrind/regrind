import z from "zod";

import { cachedFetch } from "$lib/api/cache";
import { fetchRest } from "$lib/api/transport";
import type { Profile } from "$lib/model/users/profiles";

const getBlockedUsersResponseSchema = z.object({
	blocking: z.array(
		z.object({
			profileId: z.number(),
			blockedTime: z.number(),
		}),
	),
});

export const getBlockedUsers = cachedFetch(
	() =>
		fetchRest("/v3.1/me/blocks").then(
			(res) => res.jsonParsed(getBlockedUsersResponseSchema).blocking,
		),
	{ ttlMs: 5_000 },
);

export async function blockUser({
	profileId,
}: {
	profileId: Profile["profileId"];
}) {
	await fetchRest(`/v3/me/blocks/${profileId}`, {
		method: "POST",
	}).then((res) => res.assertOk());
	// This list decides whether a profile reads as blocked by us, and backs the
	// blocked-users screen, so a stale entry would show the wrong side of the
	// block for up to the TTL.
	getBlockedUsers.invalidate();
}

export async function unblockUser({
	profileId,
}: {
	profileId: Profile["profileId"];
}) {
	await fetchRest(`/v3/me/blocks/${profileId}`, {
		method: "DELETE",
	}).then((res) => res.assertOk());
	getBlockedUsers.invalidate();
}
