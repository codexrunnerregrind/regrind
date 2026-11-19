// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SelectField from "./SelectField.svelte";

const options = [
	{ value: 1, label: "Slim" },
	{ value: 2, label: "Average" },
];

function renderField(initial: number | null) {
	const stored = $state({ value: initial });
	render(SelectField<number>, {
		props: {
			label: "Body type",
			options,
			get value() {
				return stored.value;
			},
			set value(next: number | null) {
				stored.value = next;
			},
		},
	});
	return stored;
}

const picker = () => screen.getByRole("button", { name: /^Body type / });
// The fork's row carries its label inside the trigger.
const shown = () => picker().textContent.replace("Body type", "").trim();

async function openMenu() {
	await fireEvent.keyDown(picker(), { key: "Enter" });
	await new Promise((resolve) => setTimeout(resolve, 0));
	return [...document.querySelectorAll<HTMLElement>("[role=menuitemradio]")];
}

const labelOf = (item: Element) => item.textContent.trim();

beforeEach(() => {
	Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

describe("SelectField with nothing chosen", () => {
	it("shows Not Set on the trigger", () => {
		renderField(null);

		expect(shown()).toBe("Not Set");
	});

	it("offers Not Set first and clears the choice with it", async () => {
		const stored = renderField(2);
		expect(shown()).toBe("Average");

		const items = await openMenu();
		expect(items.map(labelOf)).toEqual(["Not Set", "Slim", "Average"]);
		await fireEvent.click(items[0]!);

		expect(stored.value).toBeNull();
		expect(shown()).toBe("Not Set");
	});
});
