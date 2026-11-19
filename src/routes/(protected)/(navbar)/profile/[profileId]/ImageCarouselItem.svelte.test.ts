// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runningOn } from "#lib/test/platform.ts";
import ImageCarouselItem from "./ImageCarouselItem.svelte";

const PROPS = {
	src: "https://cdns.grindr.com/images/profile/1024x1024/a",
	thumb: "https://cdns.grindr.com/images/profile/1024x1024/a",
	createdAt: null,
	label: "Profile photo 1 of 2",
};

beforeEach(() => {
	runningOn("windows");
});

describe("ImageCarouselItem", () => {
	afterEach(cleanup);

	it("writes back intrinsic dimensions for the lightbox on load", async () => {
		const { container } = render(ImageCarouselItem, { props: PROPS });

		const img = container.querySelector("img")!;
		Object.defineProperty(img, "naturalWidth", { get: () => 1024 });
		Object.defineProperty(img, "naturalHeight", { get: () => 1365 });
		await fireEvent.load(img);

		const anchor = container.querySelector("a")!;
		expect(anchor.getAttribute("data-pswp-width")).toBe("1024");
		expect(anchor.getAttribute("data-pswp-height")).toBe("1365");
	});

	it("drops the slide link but keeps the item class on failure", async () => {
		const { container } = render(ImageCarouselItem, { props: PROPS });

		await fireEvent.error(container.querySelector("img")!);

		const anchor = container.querySelector("a")!;
		expect(anchor.hasAttribute("href")).toBe(false);
		expect(anchor.getAttribute("aria-disabled")).toBe("true");
		expect(anchor.classList.contains("item")).toBe(true);
		expect(
			container.querySelector('[data-slot="broken-media"]'),
		).not.toBeNull();
	});

	it("keeps a covered photo out of the lightbox and links to the mature content setting", () => {
		const { container } = render(ImageCarouselItem, {
			props: { ...PROPS, covered: true },
		});

		expect(container.querySelector(".item[href]")).toBeNull();
		expect(
			screen
				.getByRole("group", { name: PROPS.label })
				.contains(
					screen.getByRole("link", { name: "Show mature content" }),
				),
		).toBe(true);
		expect(container.querySelector("img")?.getAttribute("src")).toBe(
			PROPS.src,
		);
	});
});
