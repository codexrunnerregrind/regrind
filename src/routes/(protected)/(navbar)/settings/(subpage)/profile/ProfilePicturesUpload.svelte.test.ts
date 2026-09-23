// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import ProfilePicturesUpload from "./ProfilePicturesUpload.svelte";

afterEach(() => cleanup());

describe("profile pictures upload", () => {
	it("names every photo and its remove button by the slot it sits in", () => {
		const { getByRole } = render(ProfilePicturesUpload, {
			props: {
				medias: [
					{ mediaHash: "first", takenOnGrindr: false },
					{ mediaHash: "second", takenOnGrindr: false },
				],
			},
		});

		expect(getByRole("img", { name: "Profile photo 1" })).toBeTruthy();
		expect(getByRole("img", { name: "Profile photo 2" })).toBeTruthy();
		expect(
			getByRole("button", { name: "Remove profile photo 2" }),
		).toBeTruthy();
	});
});
