// @vitest-environment jsdom

import { fireEvent, render, within } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

const { setPreferencesMock, toastMock } = vi.hoisted(() => ({
	setPreferencesMock: vi.fn(),
	toastMock: vi.fn(),
}));

vi.mock("svelte-sonner", () => ({ toast: toastMock }));

vi.mock("$lib/app-data/preferences.svelte", () => ({
	setPreferences: setPreferencesMock,
	preferencesSnapshot: () => ({}),
}));

import { rendered } from "$lib/grid/grid-test-helpers";
import ForYouRow from "./ForYouRow.svelte";

const HOUR = 60 * 60 * 1000;

describe("ForYouRow", () => {
	it("counts down to the next picks", () => {
		const { container } = render(ForYouRow, {
			props: {
				profiles: [rendered({ id: 1 })],
				refreshAt: Date.now() + 9.5 * HOUR,
			},
		});

		expect(container.textContent).toContain("New picks in 10h");
	});

	it("leaves the countdown out once the refresh time has passed", () => {
		const { container } = render(ForYouRow, {
			props: {
				profiles: [rendered({ id: 1 })],
				refreshAt: Date.now() - HOUR,
			},
		});

		expect(container.textContent).not.toContain("New picks");
	});

	it("turns the band off when hidden", async () => {
		const { container } = render(ForYouRow, {
			props: { profiles: [rendered({ id: 1 })], refreshAt: null },
		});

		await fireEvent.click(
			within(container).getByRole("button", { name: "Hide" }),
		);

		expect(setPreferencesMock).toHaveBeenCalledExactlyOnceWith({
			gridForYou: false,
		});
	});

	it("offers to undo hiding", async () => {
		setPreferencesMock.mockClear();
		const { container } = render(ForYouRow, {
			props: { profiles: [rendered({ id: 1 })], refreshAt: null },
		});

		await fireEvent.click(
			within(container).getByRole("button", { name: "Hide" }),
		);
		const [, options] = toastMock.mock.lastCall as [
			string,
			{ action: { label: string; onClick: () => void } },
		];
		expect(options.action.label).toBe("Undo");
		options.action.onClick();

		expect(setPreferencesMock).toHaveBeenLastCalledWith({
			gridForYou: true,
		});
	});
});
