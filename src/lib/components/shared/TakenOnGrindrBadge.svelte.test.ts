// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import TakenOnGrindrBadge from "./TakenOnGrindrBadge.svelte";

describe("TakenOnGrindrBadge", () => {
	afterEach(cleanup);

	it("stamps when the photo was taken", () => {
		const { container } = render(TakenOnGrindrBadge, {
			props: { createdAt: Date.now() - 2 * 60 * 60 * 1000 },
		});

		expect(container.textContent).toContain("2 hrs");
	});

	it("shows the badge alone on a photo that carries no time", () => {
		const { container } = render(TakenOnGrindrBadge, {
			props: { createdAt: null },
		});

		expect(container.textContent?.trim()).toBe("Taken on Grindr");
	});

	it("drops the time when compact, where it would not fit", () => {
		const { container } = render(TakenOnGrindrBadge, {
			props: {
				createdAt: Date.now() - 2 * 60 * 60 * 1000,
				compact: true,
			},
		});

		expect(container.textContent).not.toContain("2 hrs");
	});
});
