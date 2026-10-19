// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const profiles = vi.hoisted(() => ({
	uploadProfilePhoto: vi.fn(),
	getProfileUploadedPhotos: vi.fn(),
	deleteProfilePhotos: vi.fn(),
}));

vi.mock("$lib/api/users/profiles", () => profiles);

import ProfilePicturesUpload from "./ProfilePicturesUpload.svelte";

function previousUploads(...mediaHashes: string[]) {
	profiles.getProfileUploadedPhotos.mockResolvedValue({
		medias: mediaHashes.map((mediaHash) => ({
			mediaHash,
			type: 0,
			state: 1,
		})),
	});
}

beforeEach(() => previousUploads());

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("profile pictures upload", () => {
	it("names every photo and its remove button by the slot it sits in", () => {
		const { getByRole } = render(ProfilePicturesUpload, {
			props: {
				ourProfileId: 1,
				medias: [
					{
						mediaHash: "first",
						takenOnGrindr: false,
						pending: false,
					},
					{
						mediaHash: "second",
						takenOnGrindr: false,
						pending: false,
					},
				],
			},
		});

		expect(getByRole("img", { name: "Profile photo 1" })).toBeTruthy();
		expect(getByRole("img", { name: "Profile photo 2" })).toBeTruthy();
		expect(
			getByRole("button", { name: "Remove profile photo 2" }),
		).toBeTruthy();
	});

	it("opens previous uploads from the add tile", async () => {
		const { findByRole, getByRole } = render(ProfilePicturesUpload, {
			props: { ourProfileId: 1, medias: [] },
		});

		await fireEvent.click(
			getByRole("button", { name: "Add profile photo" }),
		);

		expect(
			await findByRole("dialog", { name: "Previous uploads" }),
		).toBeTruthy();
		expect(
			await findByRole("button", { name: "Upload photos" }),
		).toBeTruthy();
	});

	it("adds chosen previous uploads after the photos already there, skipping ones on the profile", async () => {
		previousUploads("first", "earlier");
		const { findByRole, getByRole, queryByRole } = render(
			ProfilePicturesUpload,
			{
				props: {
					ourProfileId: 1,
					medias: [
						{
							mediaHash: "first",
							takenOnGrindr: false,
							pending: false,
						},
					],
				},
			},
		);

		await fireEvent.click(
			getByRole("button", { name: "Add profile photo" }),
		);
		await fireEvent.click(await findByRole("button", { name: "Photo 1" }));
		expect(queryByRole("button", { name: "Photo 2" })).toBeNull();
		await fireEvent.click(getByRole("button", { name: /Add to profile/ }));

		expect(
			await findByRole("img", { name: "Profile photo 2" }),
		).toBeTruthy();
		expect(profiles.getProfileUploadedPhotos).toHaveBeenCalledWith({
			selected: false,
		});
	});

	it("marks a removed photo and keeps it again on undo", async () => {
		const { getByRole } = render(ProfilePicturesUpload, {
			props: {
				ourProfileId: 1,
				medias: [
					{
						mediaHash: "first",
						takenOnGrindr: false,
						pending: false,
					},
				],
				removed: [],
			},
		});

		await fireEvent.click(
			getByRole("button", { name: "Remove profile photo 1" }),
		);
		expect(getByRole("img", { name: "Profile photo 1" })).toBeTruthy();
		await fireEvent.click(
			getByRole("button", { name: "Keep profile photo 1" }),
		);

		expect(
			getByRole("button", { name: "Remove profile photo 1" }),
		).toBeTruthy();
	});

	it("labels photos still awaiting review", () => {
		const { getByRole, getByText } = render(ProfilePicturesUpload, {
			props: {
				ourProfileId: 1,
				medias: [
					{ mediaHash: "first", takenOnGrindr: false, pending: true },
				],
			},
		});

		expect(
			getByRole("img", { name: "Profile photo 1, awaiting review" }),
		).toBeTruthy();
		expect(getByText("In review")).toBeTruthy();
	});
});
