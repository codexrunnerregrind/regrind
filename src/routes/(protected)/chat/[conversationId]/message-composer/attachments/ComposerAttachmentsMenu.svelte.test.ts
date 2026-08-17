// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

// The real tabs fetch albums and media; these stand in for them, exposing the
// same instance contract the sheet reads.
vi.mock("./ComposerMediaTab.svelte", async () => ({
	default: (await import("./stubs/StubTab.svelte")).default,
}));
vi.mock("./ComposerLocationTab.svelte", async () => ({
	default: (await import("./stubs/StubTab.svelte")).default,
}));
vi.mock("./ComposerAlbumsTab.svelte", async () => ({
	default: (await import("./stubs/StubAlbumsTab.svelte")).default,
}));

import ComposerAttachmentsMenu from "./ComposerAttachmentsMenu.svelte";

vi.stubGlobal(
	"ResizeObserver",
	class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
);

function openSheet() {
	return render(ComposerAttachmentsMenu, { props: { open: true } });
}

async function showAlbumsWithSelection() {
	openSheet();
	await fireEvent.click(screen.getByRole("tab", { name: "Albums" }));
	await tick();
	// The stub reports a selection the way the real tab does.
	await fireEvent.click(screen.getByTestId("select-album"));
	await tick();
}

const expiryTrigger = () =>
	screen.queryByRole("button", { name: /Indefinitely/ });

afterEach(cleanup);

describe("the attachments sheet's expiry menu", () => {
	it("opens from the button above send", async () => {
		await showAlbumsWithSelection();

		const trigger = expiryTrigger();
		expect(trigger).not.toBeNull();

		await fireEvent.pointerDown(trigger!);
		await fireEvent.click(trigger!);
		await tick();

		expect(screen.queryByText("For 24 hours")).not.toBeNull();
	});

	it("keeps the button reachable while a selection stands", async () => {
		await showAlbumsWithSelection();

		const trigger = expiryTrigger();
		expect(trigger).not.toBeNull();
		// The row is always mounted and hidden by class, so a stale hidden state
		// would silently swallow every tap on it.
		expect(trigger!.closest("[inert]")).toBeNull();
	});

	it("closes as the selection empties, rather than outliving the buttons", async () => {
		await showAlbumsWithSelection();

		const trigger = expiryTrigger();
		await fireEvent.pointerDown(trigger!);
		await fireEvent.click(trigger!);
		await tick();
		expect(screen.queryByText("For 24 hours")).not.toBeNull();

		// The row flies out on a 400ms transition; the menu must not wait for it.
		await fireEvent.click(screen.getByTestId("deselect-album"));
		await tick();
		await tick();

		expect(screen.queryByText("For 24 hours")).toBeNull();
	});
});
