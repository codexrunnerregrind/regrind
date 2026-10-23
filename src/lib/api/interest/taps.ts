import z from "zod";

import { fetchRest } from "$lib/api/transport";
import { awaitEntitlementGrant } from "$lib/entitlements/expiring-media-entitlement";
import { notePhotos } from "$lib/interest/viewer-matches";
import { type SentTap, sentTapSchema } from "$lib/model/interest/sent-tap";
import { tapProfileSchema } from "$lib/model/interest/tap-profile";
import { type TapType } from "$lib/model/interest/taps";
import type { Profile } from "$lib/model/users/profiles";

const getReceivedTapsResponseSchema = z.object({
	profiles: z.array(tapProfileSchema),
});

export async function getReceivedTaps() {
	// Wait out an in-flight handover, or the distances come back measured
	// from the granting region.
	await awaitEntitlementGrant();
	const taps = await fetchRest("/v2/taps/received").then((res) =>
		res.jsonParsed(getReceivedTapsResponseSchema),
	);
	notePhotos(
		taps.profiles.map((profile) => ({
			profileId: profile.profileId,
			hash: profile.profileImageMediaHash,
			displayName: profile.displayName,
		})),
	);
	return taps;
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

/** Our live tap to this profile, wherever it was sent from. */
export async function findSentTap(
	recipientId: Profile["profileId"],
): Promise<SentTap | undefined> {
	const sent = await getSentTaps();
	return sent.find((tap) => tap.receiverId === recipientId && !tap.deleted);
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
