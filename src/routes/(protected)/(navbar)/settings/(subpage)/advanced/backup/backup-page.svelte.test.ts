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
import BackupPage from "./+page.svelte";

describe("Create backup page", () => {
	beforeEach(async () => {
		saveTextFileMock
			.mockReset()
			.mockResolvedValue({ saved: true, cancelled: false });
		createBackupMock
			.mockReset()
			.mockResolvedValue({
				kind: "regrind-backup",
				version: 1,
				exportedAt: "2026-10-29T00:00:00.000Z",
				favorites: [],
				places: [],
				settings: { themeMode: "light" },
			});
		for (const fn of Object.values(toastMock)) fn.mockClear();
		await setPreferences({ savedLocations: [] });
	});

	afterEach(cleanup);

	it("hides saved places when there are none", () => {
		render(BackupPage);
		expect(screen.queryByLabelText("Back up favorites")).toBeNull();
		expect(screen.queryByLabelText("Back up saved places")).toBeNull();
		expect(screen.getByLabelText("Back up settings")).toBeTruthy();
	});

	it("backs up only what is ticked", async () => {
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
			],
		});
		render(BackupPage);
		await fireEvent.click(screen.getByLabelText("Back up saved places"));
		await fireEvent.click(
			screen.getByRole("button", { name: "Save backup" }),
		);
		await vi.waitFor(() => {
			expect(toastMock.success).toHaveBeenCalledWith("Backup saved", {
				id: "toast",
			});
		});
		expect(createBackupMock).toHaveBeenCalledWith({
			places: false,
			settings: true,
		});
		const [filename, text] = saveTextFileMock.mock.lastCall as [
			string,
			string,
		];
		expect(filename).toMatch(/^regrind-backup-.*\.json$/);
		expect(JSON.parse(text)).toMatchObject({
			settings: { themeMode: "light" },
		});
	});

	it("can't save an empty backup", async () => {
		render(BackupPage);
		await fireEvent.click(screen.getByLabelText("Back up settings"));
		expect(
			screen.getByRole("button", { name: "Save backup" }),
		).toHaveProperty("disabled", true);
	});
});
