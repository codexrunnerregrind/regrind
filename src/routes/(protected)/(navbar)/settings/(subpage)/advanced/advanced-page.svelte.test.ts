// @vitest-environment jsdom

import { encode } from "@msgpack/msgpack";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { saveTextFileMock, createBackupMock, toastMock } = vi.hoisted(() => ({
	saveTextFileMock: vi.fn(),
	createBackupMock: vi.fn(),
	toastMock: {
		loading: vi.fn(() => "toast"),
		success: vi.fn(),
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
	saveTextFile: saveTextFileMock,
	pickTextFile: vi.fn(),
}));
vi.mock("$lib/backup/backup", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/backup/backup")>()),
	createBackup: createBackupMock,
}));

import { setPreferences } from "$lib/app-data/preferences.svelte";
import AdvancedPage from "./+page.svelte";

function lastSaved(): { filename: string; json: Record<string, unknown> } {
	const [filename, text] = saveTextFileMock.mock.lastCall as [string, string];
	return { filename, json: JSON.parse(text) as Record<string, unknown> };
}

describe("Advanced settings page", () => {
	beforeEach(async () => {
		saveTextFileMock
			.mockReset()
			.mockResolvedValue({ saved: true, cancelled: false });
		createBackupMock.mockReset();
		for (const fn of Object.values(toastMock)) fn.mockClear();
		await setPreferences({ savedLocations: [] });
	});

	afterEach(cleanup);

	it("links the favorites, places and restore screens", () => {
		render(AdvancedPage);
		const href = (name: RegExp) =>
			screen.getByRole("link", { name }).getAttribute("href");
		expect(href(/Export favorites/)).toBe(
			"/settings/advanced/favorites/export",
		);
		expect(href(/Import favorites/)).toBe(
			"/settings/advanced/favorites/import",
		);
		expect(href(/Import saved places/)).toBe(
			"/settings/advanced/places/import",
		);
		expect(href(/Restore from backup/)).toBe("/settings/advanced/restore");
	});

	it("says so instead of saving an empty places file", async () => {
		render(AdvancedPage);
		await fireEvent.click(
			screen.getByRole("button", { name: /Export saved places/ }),
		);
		expect(toastMock.info).toHaveBeenCalledWith(
			"You have no saved places yet",
		);
		expect(saveTextFileMock).not.toHaveBeenCalled();
	});

	it("exports saved places, recents included", async () => {
		await setPreferences({
			savedLocations: [
				{
					id: "a",
					name: "Madrid",
					lat: 40.4227,
					lon: -3.6976,
					favorite: true,
					usedAt: 1,
				},
				{
					id: "b",
					name: "Lisbon",
					lat: 38.7223,
					lon: -9.1393,
					favorite: false,
					usedAt: 2,
				},
			],
		});
		render(AdvancedPage);
		await fireEvent.click(
			screen.getByRole("button", { name: /Export saved places/ }),
		);
		await vi.waitFor(() => {
			expect(toastMock.success).toHaveBeenCalledWith(
				"Exported 2 places",
				{ id: "toast" },
			);
		});
		const { filename, json } = lastSaved();
		expect(filename).toMatch(/^regrind-saved-places-.*\.json$/);
		expect(json).toMatchObject({
			kind: "regrind-saved-places",
			places: [{ name: "Madrid" }, { name: "Lisbon", favorite: false }],
		});
	});

	it("backs everything up into one file", async () => {
		createBackupMock.mockResolvedValue({
			kind: "regrind-backup",
			version: 1,
			exportedAt: "2026-10-29T00:00:00.000Z",
			favorites: [],
			places: [],
			settings: { themeMode: "light" },
		});
		render(AdvancedPage);
		await fireEvent.click(
			screen.getByRole("button", { name: /Back up everything/ }),
		);
		await vi.waitFor(() => {
			expect(toastMock.success).toHaveBeenCalledWith("Backup saved", {
				id: "toast",
			});
		});
		const { filename, json } = lastSaved();
		expect(filename).toMatch(/^regrind-backup-.*\.json$/);
		expect(json).toMatchObject({ settings: { themeMode: "light" } });
	});
});
