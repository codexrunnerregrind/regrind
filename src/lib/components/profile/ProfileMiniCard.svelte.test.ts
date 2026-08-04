// @vitest-environment jsdom

import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import ProfileMiniCard from "./ProfileMiniCard.svelte";

// Queries are scoped to each render's own container: the suite does not clean
// the document between tests, so a global lookup would find the previous card.
function noteBadge(container: HTMLElement): Element | null {
	return container.querySelector('[aria-label="Has a note"]');
}

describe("ProfileMiniCard", () => {
	it("shows the note and a badge for it", () => {
		const { container } = render(ProfileMiniCard, {
			props: { displayName: "Henry", note: "Met at the bar on Rua Nova" },
		});

		expect(container.textContent).toContain("Met at the bar on Rua Nova");
		expect(
			noteBadge(container),
			"the badge reads where the text is trimmed away",
		).not.toBeNull();
	});

	it("shows no note for a profile without one", () => {
		const { container } = render(ProfileMiniCard, {
			props: { displayName: "Henry", note: null },
		});

		expect(noteBadge(container)).toBeNull();
		expect(container.textContent).toContain("Henry");
	});

	// With nothing known about who this is, the note is the whole bottom row
	// rather than floating above an empty one.
	it("puts the note on the bottom edge when there is no name", () => {
		const { container } = render(ProfileMiniCard, {
			props: { displayName: null, age: null, note: "Met in Braga" },
		});

		const badge = noteBadge(container)?.closest("[data-slot='badge']");
		const stack = badge?.parentElement;
		expect(stack?.children).toHaveLength(1);
		expect(stack?.textContent).toContain("Met in Braga");
	});

	it("treats a blank note as none, rather than an empty badge", () => {
		const { container } = render(ProfileMiniCard, {
			props: { displayName: "Henry", note: "   " },
		});

		expect(noteBadge(container)).toBeNull();
	});
});
