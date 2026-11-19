// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { TapType } from "#lib/model/interest/taps.ts";
import TapIcon from "./TapIcon.svelte";

afterEach(cleanup);

describe("TapIcon", () => {
	it.each([
		[TapType.Friendly, "Cookie tap"],
		[TapType.Hot, "Fire tap"],
		[TapType.Looking, "Demon tap"],
	])("names tap type %i in its alt text and label", (tapType, alt) => {
		const sent = render(TapIcon, { props: { tapType, sent: true } });
		expect(sent.getByRole("img").getAttribute("alt")).toBe(alt);
		cleanup();

		const offered = render(TapIcon, { props: { tapType } });
		expect(offered.getByRole("img", { name: alt })).toBeTruthy();
	});
});
