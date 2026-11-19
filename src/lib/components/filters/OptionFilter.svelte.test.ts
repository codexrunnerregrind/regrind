// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { featureFlagsState } from "#lib/api/feature-flags-state.svelte.ts";
import { PSEUDO_MESSAGE } from "#lib/i18n/fixtures/pseudo-message.ts";
import { setLocale, SOURCE_LOCALE } from "#lib/i18n/index.ts";
import { type OptionFilterDefinition, optionFilters } from "./option-filters";
import OptionFilter from "./OptionFilter.svelte";

function offersTrans(filter: OptionFilterDefinition): boolean {
	const { container } = render(OptionFilter, {
		props: { filter, checked: true, value: [] },
	});
	container.querySelector<HTMLElement>("button[aria-expanded]")!.click();
	flushSync();
	return screen.queryByRole("button", { name: "Trans" }) !== null;
}

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("OptionFilter", () => {
	it("words its label and the unspecified choice in the active locale", async () => {
		render(OptionFilter, {
			props: {
				filter: optionFilters.bodyTypes,
				checked: true,
				value: [],
			},
		});
		const field = screen.getByRole("button", { name: /^Body Type/ });
		field.click();
		flushSync();
		const notSpecified = screen.getByRole("button", {
			name: "Not Specified",
		});

		await setLocale({ locale: "en-XA" });

		expect(field.querySelector("span")?.textContent).toMatch(
			PSEUDO_MESSAGE,
		);
		expect(notSpecified.textContent).toMatch(PSEUDO_MESSAGE);
	});
});

describe("OptionFilter while the gender filter flag is on", () => {
	beforeEach(() => {
		featureFlagsState.keys = ["gender-filter"];
	});

	afterEach(() => {
		featureFlagsState.keys = [];
	});

	it("leaves Trans out of Their Tribes", () => {
		expect(offersTrans(optionFilters.tribes)).toBe(false);
	});

	it("still offers Trans among the tribes they're into", () => {
		expect(offersTrans(optionFilters.tribesImInto)).toBe(true);
	});
});
