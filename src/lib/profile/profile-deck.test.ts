import { describe, expect, it } from "vitest";

import { armProfileDeck, claimProfileDeck } from "./profile-deck";

describe("profile deck", () => {
	it("hands the deck to the profile it was armed for", () => {
		armProfileDeck(2, { ids: [1, 2, 3] });

		expect(claimProfileDeck(2)).toEqual({ ids: [1, 2, 3] });
	});

	it("withholds it from any other profile", () => {
		armProfileDeck(2, { ids: [1, 2, 3] });

		expect(claimProfileDeck(3)).toBeNull();
	});

	it("is single use, so a later unrelated open gets nothing", () => {
		armProfileDeck(2, { ids: [1, 2, 3] });
		claimProfileDeck(2);

		expect(claimProfileDeck(2)).toBeNull();
	});

	it("keeps only the most recently armed deck", () => {
		armProfileDeck(2, { ids: [1, 2, 3] });
		armProfileDeck(9, { ids: [8, 9] });

		expect(claimProfileDeck(2)).toBeNull();
		expect(claimProfileDeck(9)).toEqual({ ids: [8, 9] });
	});
});
