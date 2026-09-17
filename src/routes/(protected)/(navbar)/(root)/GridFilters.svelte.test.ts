// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { flushSync, tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferences: vi.fn(() => Promise.resolve({})),
	setPreferences: vi.fn(() => Promise.resolve()),
	preferencesSnapshot: vi.fn(() => ({ units: "metric" })),
	preferencesAccount: vi.fn(() => null),
}));

vi.mock("$lib/api/users/genders", () => ({
	getGenders: vi.fn(() => Promise.resolve([])),
}));

vi.mock("$lib/api/users/tags", () => ({
	getTags: vi.fn(() => Promise.resolve([])),
}));

vi.mock("$lib/grid/grid-state.svelte", async () => {
	const { GridSearchFiltersState } =
		await import("$lib/grid/grid-search-filters-state.svelte");
	return {
		gridState: {
			filters: new GridSearchFiltersState({ onQueryChange: vi.fn() }),
		},
	};
});

vi.stubGlobal(
	"ResizeObserver",
	class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
);

import { gridState } from "$lib/grid/grid-state.svelte";
import GridFilters from "./GridFilters.svelte";

function closeButton() {
	const button = [...document.querySelectorAll("button")].find(
		(b) => b.textContent?.trim() === "Close",
	);
	if (!button) throw new Error("no close button");
	return button;
}

function named(text: string) {
	const button = [...document.querySelectorAll("button")].find(
		(b) => b.textContent?.trim() === text,
	);
	if (!button) throw new Error(`no button ${text}`);
	return button;
}

function labelled(text: string) {
	const label = [...document.querySelectorAll("label")].find(
		(l) => l.textContent?.trim() === text,
	);
	if (!label) throw new Error(`no label ${text}`);
	return label;
}

describe("GridFilters", () => {
	afterEach(cleanup);

	it("warns before closing with unapplied changes", async () => {
		await gridState.filters.ready;
		render(GridFilters, { props: { open: true } });
		flushSync();

		labelled("Online now").click();
		await tick();

		closeButton().click();
		await tick();
		await tick();

		expect(document.body.textContent).toContain("Discard filter changes?");
		expect(document.body.textContent).toContain("Filters");
		expect(gridState.filters.value?.isOnline).toBe(false);
	});

	it("throws the edit away once the warning is confirmed", async () => {
		await gridState.filters.ready;
		render(GridFilters, { props: { open: true } });
		flushSync();

		labelled("Online now").click();
		await tick();
		closeButton().click();
		await tick();
		await tick();

		named("Discard").click();
		await tick();
		await tick();

		expect(document.body.textContent).not.toContain("Apply");
		expect(gridState.filters.value?.isOnline).toBe(false);
	});

	it("closes without a warning when nothing was touched", async () => {
		await gridState.filters.ready;
		render(GridFilters, { props: { open: true } });
		flushSync();

		closeButton().click();
		await tick();
		await tick();

		expect(document.body.textContent).not.toContain(
			"Discard filter changes?",
		);
		// The sheet itself is gone, so the close went through.
		expect(document.body.textContent).not.toContain("Apply");
	});
});
