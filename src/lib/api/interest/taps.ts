import z from "zod";

import { fetchRest } from "$lib/api/transport";
import { awaitEntitlementSeed } from "$lib/entitlements/expiring-media-entitlement";
import { sentTapSchema } from "$lib/model/interest/sent-tap";
import { tapProfileSchema } from "$lib/model/interest/tap-profile";
import { type TapType } from "$lib/model/interest/taps";
import type { Profile } from "$lib/model/users/profiles";

const getReceivedTapsResponseSchema = z.object({
	profiles: z.array(tapProfileSchema),
});

export async function getReceivedTaps() {
	// Wait out any in-flight entitlement seed, or the tap distances come back
	// measured from the granting region instead of where we are. Instant once
	// nothing is seeding.
	await awaitEntitlementSeed();
	return await fetchRest("/v2/taps/received").then((res) =>
		res.jsonParsed(getReceivedTapsResponseSchema),
	);
}

const getSentTapsResponseSchema = z.array(sentTapSchema);

/**
 * The taps we sent. A bare array, and unlike the received list it carries ids
 * only — the recipients have to be fetched separately.
 */
export async function getSentTaps() {
	return await fetchRest("/v1/interactions/taps/sent").then((res) =>
		res.jsonParsed(getSentTapsResponseSchema),
	);
}

const sendTapResponseSchema = z.object({ isMutual: z.boolean() });

export async function sendTap({
	recipientId,
	tapType,
}: {
	recipientId: Profile["profileId"];
	tapType: TapType;
}) {
	return await fetchRest("/v2/taps/add", {
		method: "POST",
		body: { recipientId, tapType },
	}).then((res) => res.jsonParsed(sendTapResponseSchema));
}
