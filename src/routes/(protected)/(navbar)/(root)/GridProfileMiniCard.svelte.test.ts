// @vitest-environment jsdom

import { render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const preferences = vi.hoisted(() => ({ gridLastOnline: true }));

vi.mock("$lib/app-data/preferences.svelte", () => ({
	preferencesSnapshot: () => preferences,
}));

import GridProfileMiniCard from "./GridProfileMiniCard.svelte";

const HOUR = 60 * 60 * 1000;

describe("GridProfileMiniCard", () => {
	afterEach(() => {
		preferences.gridLastOnline = true;
	});

	it("shows when an offline profile was last online", () => {
		const { container } = render(GridProfileMiniCard, {
			props: {
				id: 1,
				displayName: "Henry",
				onlineUntil: Date.now() - HOUR,
				seen: Date.now() - 3 * HOUR,
			},
		});

		expect(container.textContent).toContain("3h ago");
	});

	it("shows Offline when the last-online time is unknown", () => {
		const { container } = render(GridProfileMiniCard, {
			props: {
				id: 1,
				displayName: "Henry",
				onlineUntil: null,
				seen: null,
			},
		});

		expect(container.textContent).toContain("Offline");
	});

	it("shows no last-online time for a profile online now", () => {
		const { container } = render(GridProfileMiniCard, {
			props: {
				id: 1,
				displayName: "Henry",
				onlineUntil: Date.now() + HOUR,
				seen: Date.now() - 3 * HOUR,
			},
		});

		expect(container.textContent).not.toContain("ago");
		expect(container.textContent).not.toContain("Offline");
	});

	it("shows nothing when the setting is off", () => {
		preferences.gridLastOnline = false;
		const { container } = render(GridProfileMiniCard, {
			props: {
				id: 1,
				displayName: "Henry",
				onlineUntil: null,
				seen: Date.now() - 3 * HOUR,
			},
		});

		expect(container.textContent).not.toContain("ago");
		expect(container.textContent).not.toContain("Offline");
	});
});
