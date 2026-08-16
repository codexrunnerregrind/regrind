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

	// With nothing known about who this is, the note is the only line in the
	// label band rather than sitting under an empty name row.
	it("puts the note on the bottom edge when there is no name", () => {
		const { container } = render(ProfileMiniCard, {
			props: { displayName: null, age: null, note: "Met in Braga" },
		});

		const label = noteBadge(container)?.closest(".tile-scrim");
		expect(label?.firstElementChild?.children).toHaveLength(1);
		expect(label?.textContent).toContain("Met in Braga");
	});

	// Name and note share one band — two lines in a single gradient overlay, not
	// two separate chips stacked on the photo.
	it("carries the name and the note on one label band", () => {
		const { container } = render(ProfileMiniCard, {
			props: { displayName: "Henry", note: "Met in Braga" },
		});

		const label = noteBadge(container)?.closest(".tile-scrim");
		expect(container.querySelectorAll(".tile-scrim")).toHaveLength(1);
		expect(label?.firstElementChild?.children).toHaveLength(2);
		expect(label?.textContent).toContain("Henry");
		expect(label?.textContent).toContain("Met in Braga");
	});

	// The dot rides in the identity row, so a nameless profile used to drop it
	// along with the row it sits in.
	it("shows the online dot for a profile without a display name", () => {
		const { container } = render(ProfileMiniCard, {
			props: {
				displayName: null,
				age: null,
				onlineUntil: Date.now() + 60_000,
			},
		});

		expect(container.querySelector('[title="Online now"]')).not.toBeNull();
	});

	it("shows no status row for an offline profile without a name", () => {
		const { container } = render(ProfileMiniCard, {
			props: {
				displayName: null,
				age: null,
				onlineUntil: Date.now() - 60_000,
			},
		});

		expect(container.querySelector(".tile-scrim")).toBeNull();
	});

	it("treats a blank note as none, rather than an empty badge", () => {
		const { container } = render(ProfileMiniCard, {
			props: { displayName: "Henry", note: "   " },
		});

		expect(noteBadge(container)).toBeNull();
	});
});
