import type { getProfiles } from "$lib/api/users/profiles";

type ResolvedProfile = Awaited<ReturnType<typeof getProfiles>>[number];

export type ProfileListEntry = {
	profileId: number;
	// Null when the profile batch had nothing for this id. Blocking and hiding
	// take a profile away from us too, so this is a common case rather than the
	// odd one, and the entry stays in the list either way.
	profile: ResolvedProfile | null;
};

export type ProfileListScroll = { scrollY: number };

/** What the list's one per-row action is, and what to say about it. */
export type ProfileListAction = {
	/** Verb on the row's chip: "Unblock", "Unhide". */
	actionLabel: string;
	/** Follows the count above the list: "12 blocked". */
	countLabel: string;
	emptyMessage: string;
	successMessage: string;
	errorLabel: string;
	/** Lifts the block or the hide, taking the row out of the list. */
	lift: (args: { profileId: number }) => Promise<void>;
};
