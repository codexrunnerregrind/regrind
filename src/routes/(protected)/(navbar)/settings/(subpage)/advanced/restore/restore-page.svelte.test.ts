// @vitest-environment jsdom

import { encode } from "@msgpack/msgpack";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pickTextFileMock, toastMock } = vi.hoisted(() => ({
	pickTextFileMock: vi.fn(),
	toastMock: {
		loading: vi.fn(),
		success: vi.fn(),
		warning: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
		dismiss: vi.fn(),
	},
}));

vi.mock("$lib/app-data", () => ({
	existsAppDataFile: () => Promise.resolve(false),
	readAppDataFile: () => Promise.resolve(encode({})),
	removeAppDataFile: () => Promise.resolve(),
	writeAppDataFileAtomic: () => Promise.resolve(),
}));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));
vi.mock("$lib/platform/data-file", () => ({
	saveTextFile: vi.fn(),
	pickTextFile: pickTextFileMock,
}));

import {
	getPreferences,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import RestorePage from "./+page.svelte";

const madrid = {
	id: "a",
	name: "Madrid",
	lat: 40.4227,
	lon: -3.6976,
	favorite: true,
	usedAt: 1,
};

function backupFile() {
	return JSON.stringify({
		kind: "regrind-backup",
		version: 1,
		exportedAt: "2026-10-29T00:00:00.000Z",
		places: [
			{
				name: "Madrid",
				lat: madrid.lat,
				lon: madrid.lon,
				favorite: true,
			},
			{ name: "Porto", lat: 41.1579, lon: -8.6291, favorite: true },
			{ name: "Lisbon", lat: 38.7223, lon: -9.1393, favorite: true },
		],
		settings: { themeMode: "light" },
	});
}

async function chooseFile() {
	render(RestorePage);
	await fireEvent.click(
		screen.getByRole("button", { name: /Choose a file/ }),
	);
	await screen.findByText("2 of 2 selected");
}

describe("Restore from backup page", () => {
	beforeEach(async () => {
		pickTextFileMock.mockReset().mockResolvedValue(backupFile());
		for (const fn of Object.values(toastMock)) fn.mockClear();
		await setPreferences({ savedLocations: [madrid], themeMode: "dark" });
	});

	afterEach(cleanup);

	it("folds the places away until asked, leaving out ones already saved", async () => {
		await chooseFile();
		expect(screen.getByLabelText("Restore settings")).toBeTruthy();
		expect(screen.queryByText("Porto")).toBeNull();
		await fireEvent.click(
			screen.getByRole("button", { name: /Saved places/ }),
		);
		expect(screen.getByText("Porto")).toBeTruthy();
		expect(screen.getByText("Already saved")).toBeTruthy();
	});

	it("ticks and unticks every place at once", async () => {
		await chooseFile();
		await fireEvent.click(screen.getByLabelText("Restore saved places"));
		expect(screen.getByText("0 of 2 selected")).toBeTruthy();
		await fireEvent.click(screen.getByLabelText("Restore saved places"));
		expect(screen.getByText("2 of 2 selected")).toBeTruthy();
	});

	it("restores the ticked places and settings only", async () => {
		await chooseFile();
		await fireEvent.click(
			screen.getByRole("button", { name: /Saved places/ }),
		);
		await fireEvent.click(screen.getByLabelText("Include Lisbon"));
		await fireEvent.click(screen.getByLabelText("Restore settings"));
		await fireEvent.click(screen.getByRole("button", { name: "Restore" }));
		await vi.waitFor(() => {
			expect(toastMock.success).toHaveBeenCalledWith("Restored");
		});
		const after = await getPreferences();
		expect(after.savedLocations.map((place) => place.name)).toEqual([
			"Madrid",
			"Porto",
		]);
		expect(after.themeMode).toBe("dark");
	});

	it("reports a file that isn't a backup", async () => {
		pickTextFileMock.mockResolvedValue('{"kind":"regrind-favorites"}');
		render(RestorePage);
		await fireEvent.click(
			screen.getByRole("button", { name: /Choose a file/ }),
		);
		await vi.waitFor(() => {
			expect(toastMock.error).toHaveBeenCalledWith(
				"That file isn't a ReGrind backup.",
			);
		});
	});
});
