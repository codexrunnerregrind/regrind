// @vitest-environment jsdom

import { encode } from "@msgpack/msgpack";
import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/app-data", () => ({
	existsAppDataFile: () => Promise.resolve(false),
	readAppDataFile: () => Promise.resolve(encode({})),
	removeAppDataFile: () => Promise.resolve(),
	writeAppDataFileAtomic: () => Promise.resolve(),
}));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));

import AdvancedPage from "./+page.svelte";

describe("Advanced settings page", () => {
	afterEach(cleanup);

	it("links the backup and favorites screens", () => {
		render(AdvancedPage);
		const href = (name: RegExp) =>
			screen.getByRole("link", { name }).getAttribute("href");
		expect(href(/Create backup/)).toBe("/settings/advanced/backup");
		expect(href(/Restore from backup/)).toBe("/settings/advanced/restore");
		expect(href(/Export favorites/)).toBe(
			"/settings/advanced/favorites/export",
		);
		expect(href(/Import favorites/)).toBe(
			"/settings/advanced/favorites/import",
		);
	});

	it("has no standalone saved places rows", () => {
		render(AdvancedPage);
		expect(screen.queryByText(/saved places$/i)).toBeNull();
	});
});
