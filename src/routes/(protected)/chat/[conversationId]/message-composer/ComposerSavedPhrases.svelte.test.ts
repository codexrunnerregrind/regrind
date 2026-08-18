// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
	getSavedPhrases: vi.fn(),
	createSavedPhrase: vi.fn(),
	deleteSavedPhrase: vi.fn(),
	trackSavedPhraseUsage: vi.fn(),
}));
vi.mock("$lib/api/messaging/phrases", () => api);

vi.mock("./message-composer-context.svelte", () => ({
	getMessageComposerContext: () => () => ({ disabled: false }),
}));

vi.stubGlobal(
	"ResizeObserver",
	class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
);

import { savedPhrases } from "$lib/chat/saved-phrases.svelte";
import ComposerSavedPhrases from "./ComposerSavedPhrases.svelte";

const HEY = { id: "1", text: "Hey", type: "user" };

function renderBar({
	onSelect = () => {},
	draft = "",
}: { onSelect?: (text: string) => void; draft?: string } = {}) {
	return render(ComposerSavedPhrases, { props: { onSelect, draft } });
}

/** Two ticks: one for the load effect, one for what it puts on screen. */
async function settle() {
	await tick();
	await tick();
	await tick();
}

// The long-press helper throttles on a module-global clock, so a contextmenu
// in one test would swallow the next test's. Each test starts a minute later.
let clock = Date.now();

describe("ComposerSavedPhrases", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clock += 60_000;
		vi.spyOn(Date, "now").mockImplementation(() => clock);
		savedPhrases.reset();
		api.getSavedPhrases.mockResolvedValue([HEY]);
		api.createSavedPhrase.mockImplementation((text: string) =>
			Promise.resolve({ id: "new", text, type: "user" }),
		);
		api.deleteSavedPhrase.mockResolvedValue(undefined);
		api.trackSavedPhraseUsage.mockResolvedValue(undefined);
	});

	afterEach(cleanup);

	it("hands the phrase to the composer and counts the use", async () => {
		const onSelect = vi.fn();
		renderBar({ onSelect });
		await settle();

		await fireEvent.click(screen.getByRole("button", { name: "Hey" }));

		expect(onSelect).toHaveBeenCalledExactlyOnceWith("Hey");
		expect(api.trackSavedPhraseUsage).toHaveBeenCalledWith("1");
	});

	it("offers to save the line already typed", async () => {
		api.getSavedPhrases.mockResolvedValue([]);
		renderBar({ draft: "  What are you up to?  " });
		await settle();

		await fireEvent.click(
			screen.getByRole("button", {
				name: /Save a phrase you send often/,
			}),
		);
		await settle();

		expect(
			screen.getByPlaceholderText<HTMLInputElement>("Phrase").value,
		).toBe("What are you up to?");
	});

	it("saves a new phrase from the dialog", async () => {
		renderBar();
		await settle();

		await fireEvent.click(
			screen.getByRole("button", { name: "Save a phrase" }),
		);
		await settle();
		const input = screen.getByPlaceholderText("Phrase");
		await fireEvent.input(input, { target: { value: "Later?" } });
		await fireEvent.click(screen.getByRole("button", { name: "Save" }));
		await settle();

		expect(api.createSavedPhrase).toHaveBeenCalledWith("Later?");
		expect(screen.getByRole("button", { name: "Later?" })).toBeTruthy();
	});

	it("only offers deleting and renaming once edit mode is entered", async () => {
		const onSelect = vi.fn();
		renderBar({ onSelect });
		await settle();

		expect(screen.queryByRole("button", { name: /Delete phrase/ })).toBe(
			null,
		);

		const chip = screen.getByRole("button", { name: "Hey" });
		await fireEvent.contextMenu(chip);
		await settle();

		// A tap now renames rather than dropping the phrase into the field.
		await fireEvent.click(chip);
		await settle();
		expect(onSelect).not.toHaveBeenCalled();
		expect(
			screen.getByPlaceholderText<HTMLInputElement>("Phrase").value,
		).toBe("Hey");
	});

	it("deletes a phrase from edit mode", async () => {
		renderBar();
		await settle();

		await fireEvent.contextMenu(
			screen.getByRole("button", { name: "Hey" }),
		);
		await settle();
		await fireEvent.click(
			screen.getByRole("button", { name: 'Delete phrase "Hey"' }),
		);
		await settle();

		expect(api.deleteSavedPhrase).toHaveBeenCalledWith("1");
		expect(screen.queryByRole("button", { name: "Hey" })).toBe(null);
	});
});
