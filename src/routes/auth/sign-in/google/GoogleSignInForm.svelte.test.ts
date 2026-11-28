// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetPlatform, runningOn } from "#lib/test/platform.ts";

const { callMethodMock, toastMock } = vi.hoisted(() => ({
	callMethodMock: vi.fn(),
	toastMock: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("#lib/api/methods.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/api/methods.ts")>()),
	callMethod: callMethodMock,
}));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));

import GoogleSignInForm from "./GoogleSignInForm.svelte";

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("GoogleSignInForm", () => {
	beforeEach(() => {
		callMethodMock.mockReset();
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		cleanup();
		resetPlatform();
		vi.restoreAllMocks();
	});

	it.each(["android", "ios", "linux", "macos", "windows"] as const)(
		"asks for a token from the Open Grind Google OAuth app on %s",
		(platform) => {
			runningOn(platform);
			render(GoogleSignInForm);

			expect(screen.getByLabelText("Token")).toBeTruthy();
			expect(
				screen
					.getByRole("link", { name: "Open Grind Google OAuth app" })
					.getAttribute("href"),
			).toBe(
				"https://git.opengrind.org/open-grind/google-oauth-app/releases#install",
			);
		},
	);

	it("signs in with the pasted token, trimmed", async () => {
		runningOn("android");
		callMethodMock.mockRejectedValue(new Error("refused"));
		render(GoogleSignInForm);

		await fireEvent.input(screen.getByLabelText("Token"), {
			target: { value: "  pasted-token \n" },
		});
		await fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
		await settled();

		expect(callMethodMock).toHaveBeenCalledWith(
			"sign_in_with_google_token",
			{ token: "pasted-token" },
		);
	});
});
