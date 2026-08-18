import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
	getSavedPhrases: vi.fn(),
	createSavedPhrase: vi.fn(),
	deleteSavedPhrase: vi.fn(),
	trackSavedPhraseUsage: vi.fn(),
}));
vi.mock("$lib/api/messaging/phrases", () => api);

const showErrorToast = vi.hoisted(() => vi.fn());
vi.mock("$lib/api/error-toast", () => ({ showErrorToast }));

import { SavedPhrasesState } from "./saved-phrases.svelte";

const HEY = { id: "1", text: "Hey", type: "user" };

describe("SavedPhrasesState", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		api.getSavedPhrases.mockResolvedValue([HEY]);
		api.createSavedPhrase.mockImplementation((text: string) =>
			Promise.resolve({ id: "new", text, type: "user" }),
		);
		api.deleteSavedPhrase.mockResolvedValue(undefined);
		api.trackSavedPhraseUsage.mockResolvedValue(undefined);
	});

	it("loads once however many callers ask", async () => {
		const state = new SavedPhrasesState();
		await Promise.all([state.load(), state.load()]);
		await state.load();

		expect(api.getSavedPhrases).toHaveBeenCalledTimes(1);
		expect(state.phrases).toEqual([HEY]);
	});

	it("leaves the list loadable again after a failed read", async () => {
		api.getSavedPhrases.mockRejectedValueOnce(new Error("offline"));
		vi.spyOn(console, "error").mockImplementation(() => {});
		const state = new SavedPhrasesState();

		await state.load();
		expect(state.phrases).toEqual([]);

		await state.load();
		expect(state.phrases).toEqual([HEY]);
	});

	it("shows an added phrase before the request lands, then adopts the stored id", async () => {
		const state = new SavedPhrasesState();
		await state.load();

		const added = state.add("  Later?  ");
		expect(state.phrases.map((phrase) => phrase.text)).toEqual([
			"Hey",
			"Later?",
		]);

		await added;
		expect(state.phrases.at(-1)).toEqual({
			id: "new",
			text: "Later?",
			type: "user",
		});
		expect(api.createSavedPhrase).toHaveBeenCalledWith("Later?");
	});

	it("re-reads the list when the create answers without a phrase", async () => {
		api.createSavedPhrase.mockResolvedValueOnce(null);
		const state = new SavedPhrasesState();
		await state.load();
		api.getSavedPhrases.mockResolvedValue([
			HEY,
			{ id: "2", text: "Later?", type: "user" },
		]);

		await state.add("Later?");

		expect(state.phrases.map((phrase) => phrase.id)).toEqual(["1", "2"]);
	});

	it("puts an added phrase back on the shelf when the save fails", async () => {
		api.createSavedPhrase.mockRejectedValueOnce(new Error("nope"));
		const state = new SavedPhrasesState();
		await state.load();

		await state.add("Later?");

		expect(state.phrases).toEqual([HEY]);
		expect(showErrorToast).toHaveBeenCalledWith(
			expect.objectContaining({ label: "Failed to save phrase" }),
		);
	});

	it("restores a deleted phrase when the delete fails", async () => {
		api.deleteSavedPhrase.mockRejectedValueOnce(new Error("nope"));
		const state = new SavedPhrasesState();
		await state.load();

		await state.remove("1");

		expect(state.phrases).toEqual([HEY]);
		expect(showErrorToast).toHaveBeenCalledWith(
			expect.objectContaining({ label: "Failed to delete phrase" }),
		);
	});

	it("renames by creating the replacement before deleting the original", async () => {
		const order: string[] = [];
		api.createSavedPhrase.mockImplementationOnce((text: string) => {
			order.push("create");
			return Promise.resolve({ id: "2", text, type: "user" });
		});
		api.deleteSavedPhrase.mockImplementationOnce(() => {
			order.push("delete");
			return Promise.resolve();
		});
		const state = new SavedPhrasesState();
		await state.load();

		await state.rename({ id: "1", text: "Hey there" });

		expect(order).toEqual(["create", "delete"]);
		expect(api.deleteSavedPhrase).toHaveBeenCalledWith("1");
		expect(state.phrases).toEqual([
			{ id: "2", text: "Hey there", type: "user" },
		]);
	});

	it("keeps the original text when a rename fails", async () => {
		api.createSavedPhrase.mockRejectedValueOnce(new Error("nope"));
		const state = new SavedPhrasesState();
		await state.load();

		await state.rename({ id: "1", text: "Hey there" });

		expect(state.phrases).toEqual([HEY]);
		expect(showErrorToast).toHaveBeenCalledWith(
			expect.objectContaining({ label: "Failed to rename phrase" }),
		);
	});

	it("does not count a use of a phrase the server has not stored yet", async () => {
		const state = new SavedPhrasesState();
		await state.load();

		state.use("1");
		state.use("pending:1");

		expect(api.trackSavedPhraseUsage).toHaveBeenCalledExactlyOnceWith("1");
	});

	it("forgets everything on reset so the next account loads its own", async () => {
		const state = new SavedPhrasesState();
		await state.load();

		state.reset();
		expect(state.phrases).toEqual([]);

		await state.load();
		expect(api.getSavedPhrases).toHaveBeenCalledTimes(2);
	});
});
