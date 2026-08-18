// @vitest-environment jsdom

import { encode } from "@msgpack/msgpack";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { readMock, writeMock, existsMock } = vi.hoisted(() => ({
	readMock: vi.fn(),
	writeMock: vi.fn(),
	existsMock: vi.fn(),
}));

vi.mock("$lib/app-data", () => ({
	existsAppDataFile: existsMock,
	readAppDataFile: readMock,
	removeAppDataFile: () => Promise.resolve(),
	writeAppDataFileAtomic: writeMock,
}));
vi.mock("svelte-sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));

import { getSavedLocationsSnapshot } from "$lib/app-data/preferences.svelte";
import {
	rememberLocation,
	removeSavedLocation,
} from "$lib/app-data/saved-locations";
import SavedLocationsPanel from "./SavedLocationsPanel.svelte";

// jsdom has no layout, so the panel's scroll-the-edited-row-into-view call
// would reject.
Element.prototype.scrollIntoView = () => {};

const onPick = vi.fn();
const onClose = vi.fn();

function renderPanel() {
	return render(SavedLocationsPanel, { props: { onPick, onClose } });
}

beforeEach(async () => {
	vi.clearAllMocks();
	existsMock.mockResolvedValue(false);
	readMock.mockResolvedValue(encode({}));
	writeMock.mockResolvedValue(undefined);
	for (const location of getSavedLocationsSnapshot()) {
		await removeSavedLocation(location.id);
	}
});

afterEach(cleanup);

describe("SavedLocationsPanel", () => {
	it("explains itself while empty", () => {
		renderPanel();
		expect(screen.getByText(/No saved places yet/)).toBeTruthy();
	});

	it("groups favorites above the history", async () => {
		await rememberLocation({
			lat: 40.4227,
			lon: -3.6976,
			label: "Sol",
			favorite: true,
			now: 1,
		});
		await rememberLocation({ lat: 51.5, lon: -0.12, now: 2 });
		renderPanel();
		expect(screen.getByText("Favorites")).toBeTruthy();
		expect(screen.getByText("Recent")).toBeTruthy();
		// A hand-dropped pin is labelled with its coordinates, which then show up
		// both as its name and as its subtitle.
		expect(screen.getAllByText("51.5000° N, 0.1200° W")).toHaveLength(2);
	});

	it("hands a picked location back to the map", async () => {
		await rememberLocation({
			lat: 40.4227,
			lon: -3.6976,
			label: "Sol",
			now: 1,
		});
		renderPanel();
		await fireEvent.click(screen.getByText("Sol"));
		expect(onPick).toHaveBeenCalledWith(
			expect.objectContaining({ name: "Sol", lat: 40.4227 }),
		);
	});

	it("renames an entry from the pencil button", async () => {
		await rememberLocation({
			lat: 40.4227,
			lon: -3.6976,
			label: "Sol",
			now: 1,
		});
		renderPanel();
		await fireEvent.click(screen.getByLabelText("Rename Sol"));
		const input = screen.getByLabelText("Location name");
		await fireEvent.input(input, { target: { value: "Work" } });
		await fireEvent.click(screen.getByLabelText("Save name"));
		await vi.waitFor(() =>
			expect(getSavedLocationsSnapshot()[0]?.name).toBe("Work"),
		);
	});

	it("keeps an emptied field empty instead of refilling it", async () => {
		await rememberLocation({
			lat: 40.4227,
			lon: -3.6976,
			label: "Sol",
			now: 1,
		});
		renderPanel();
		await fireEvent.click(screen.getByLabelText("Rename Sol"));
		const input = screen.getByLabelText("Location name");
		await fireEvent.input(input, { target: { value: "" } });
		expect((input as HTMLInputElement).value).toBe("");
	});

	it("stars and unstars an entry", async () => {
		await rememberLocation({
			lat: 40.4227,
			lon: -3.6976,
			label: "Sol",
			now: 1,
		});
		renderPanel();
		await fireEvent.click(screen.getByLabelText("Add Sol to favorites"));
		await vi.waitFor(() =>
			expect(getSavedLocationsSnapshot()[0]?.favorite).toBe(true),
		);
		await fireEvent.click(
			screen.getByLabelText("Remove Sol from favorites"),
		);
		await vi.waitFor(() =>
			expect(getSavedLocationsSnapshot()[0]?.favorite).toBe(false),
		);
	});

	it("deletes an entry", async () => {
		await rememberLocation({
			lat: 40.4227,
			lon: -3.6976,
			label: "Sol",
			now: 1,
		});
		renderPanel();
		await fireEvent.click(screen.getByLabelText("Delete Sol"));
		await vi.waitFor(() =>
			expect(getSavedLocationsSnapshot()).toHaveLength(0),
		);
	});
});
