import {
	accountEpoch,
	isAccountEpochCurrent,
	registerAccountCache,
} from "#lib/api/account-caches.ts";
import { getSentTaps } from "#lib/api/interest/taps.ts";
import { recordSentTaps } from "#lib/interest/profile-activity.svelte.ts";

let loading: Promise<void> | null = null;

registerAccountCache({
	reset: () => {
		loading = null;
	},
});

/** Seeds the sent-tap map once per account for the grid's tap markers. */
export function ensureSentTapsLoaded(): void {
	if (loading !== null) return;
	const epoch = accountEpoch();
	loading = getSentTaps().then(
		(taps) => {
			if (!isAccountEpochCurrent(epoch)) return;
			recordSentTaps(
				taps
					.filter((tap) => !tap.deleted)
					.map((tap) => ({
						profileId: tap.receiverId,
						timestamp: tap.sentOn,
						tapType: tap.tapType,
					})),
			);
		},
		(error: unknown) => {
			console.error(error);
			if (isAccountEpochCurrent(epoch)) loading = null;
		},
	);
}
