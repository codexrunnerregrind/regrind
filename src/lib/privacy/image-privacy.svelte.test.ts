// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	preferences: { discreetImages: false },
	save: vi.fn(),
	error: vi.fn(),
}));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: mocks.error }));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	preferencesLoaded: () => true,
	preferencesSnapshot: () => mocks.preferences,
	setPreferences: mocks.save,
}));

import { imagePrivacy, toggleImagePrivacy } from "./image-privacy.svelte";

describe("image privacy toggling", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		imagePrivacy.override = null;
		imagePrivacy.pending = false;
		mocks.preferences.discreetImages = false;
		mocks.save.mockImplementation(
			({ discreetImages }: { discreetImages: boolean }) => {
				mocks.preferences.discreetImages = discreetImages;
				return Promise.resolve();
			},
		);
	});

	it("hides immediately and persists both directions", async () => {
		const saved = toggleImagePrivacy();
		expect(imagePrivacy.override).toBe(true);
		await saved;
		expect(mocks.preferences.discreetImages).toBe(true);
		await toggleImagePrivacy();
		expect(mocks.preferences.discreetImages).toBe(false);
	});

	it("keeps images hidden if persistence fails", async () => {
		mocks.save.mockRejectedValue(new Error("disk unavailable"));
		await toggleImagePrivacy();
		expect(imagePrivacy.override).toBe(true);
		expect(imagePrivacy.pending).toBe(false);
		expect(mocks.error).toHaveBeenCalledOnce();
	});

	it("does not reveal images until the save succeeds", async () => {
		mocks.preferences.discreetImages = true;
		mocks.save.mockRejectedValue(new Error("disk unavailable"));
		await toggleImagePrivacy();
		expect(mocks.preferences.discreetImages).toBe(true);
	});

	it("ignores overlapping button and gesture events", async () => {
		let finish!: () => void;
		mocks.save.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				}),
		);
		const first = toggleImagePrivacy();
		await toggleImagePrivacy();
		expect(mocks.save).toHaveBeenCalledOnce();
		finish();
		await first;
	});
});
