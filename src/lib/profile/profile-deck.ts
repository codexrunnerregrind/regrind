/**
 * The ordered list of profiles a screen was showing when one of them was
 * opened, handed to the profile screen so it can page between them with a
 * horizontal swipe.
 *
 * It is armed for one specific profile id and consumed once, rather than left
 * lying around as ambient state: profiles are reachable from taps, views, Right
 * Now, chat and search as well, and opening one of those should not silently
 * drop you into whatever list some earlier screen happened to be showing.
 */

export type ProfileDeck = {
	/** Profile ids in the order the originating screen listed them. */
	ids: number[];
	/**
	 * Pulls the next page of the originating list and resolves with the grown
	 * id list, so paging can keep going past the ids loaded at open time.
	 * Omitted when the list is not paged.
	 */
	extend?: () => Promise<number[]>;
};

let armed: { profileId: number; deck: ProfileDeck } | null = null;

/** Offer `deck` to the profile screen, but only if it opens `profileId`. */
export function armProfileDeck(profileId: number, deck: ProfileDeck): void {
	armed = { profileId, deck };
}

/** Take the deck armed for `profileId`, if there is one. Single use. */
export function claimProfileDeck(profileId: number): ProfileDeck | null {
	if (armed?.profileId !== profileId) return null;
	const { deck } = armed;
	armed = null;
	return deck;
}
