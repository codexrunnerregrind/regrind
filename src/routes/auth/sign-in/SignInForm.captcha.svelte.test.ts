// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	callMethodMock,
	expectReady,
	gotoMock,
	invalidCredentials,
	resetSignInMocks,
	submitSignIn,
	toastMock,
} from "./sign-in-form-test-helpers";
import SignInForm from "./SignInForm.svelte";

vi.mock("$app/navigation", async () => ({
	goto: (await import("./sign-in-form-test-helpers")).gotoMock,
}));
vi.mock("#lib/api/methods.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/api/methods.ts")>()),
	callMethod: (await import("./sign-in-form-test-helpers")).callMethodMock,
}));
vi.mock("#lib/api/accounts.svelte.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/api/accounts.svelte.ts")>()),
	accountSignedIn: () => Promise.resolve(),
}));
vi.mock("svelte-sonner", async () => ({
	toast: (await import("./sign-in-form-test-helpers")).toastMock,
}));
async function rejectMint(reason: string) {
	callMethodMock
		.mockRejectedValueOnce(invalidCredentials)
		.mockResolvedValueOnce(true)
		.mockRejectedValueOnce({ kind: "Recaptcha", message: { reason } });
	render(SignInForm);
	await submitSignIn();
}

async function retryWithCaptcha(failure: unknown) {
	callMethodMock
		.mockRejectedValueOnce(invalidCredentials)
		.mockResolvedValueOnce(true)
		.mockResolvedValueOnce("captcha-token")
		.mockRejectedValueOnce(failure);
	render(SignInForm);
	await submitSignIn();
}

describe("SignInForm CAPTCHA retry", () => {
	beforeEach(resetSignInMocks);

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it.each([
		["disabled", false],
		["check failed", new Error("Assignment check failed")],
	])(
		"reports wrong credentials when the CAPTCHA assignment is unavailable (%s)",
		async (_name, assignment) => {
			callMethodMock.mockRejectedValueOnce(invalidCredentials);
			if (assignment === false)
				callMethodMock.mockResolvedValueOnce(false);
			else callMethodMock.mockRejectedValueOnce(assignment);
			render(SignInForm);

			await submitSignIn();

			expect(callMethodMock).toHaveBeenCalledTimes(2);
			expect(callMethodMock).toHaveBeenLastCalledWith(
				"recaptcha_first_party_enabled",
			);
			expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
				"Incorrect email or password",
			);
			expect(gotoMock).not.toHaveBeenCalled();
			expectReady();
		},
	);

	it("obtains a login CAPTCHA without consulting the assignment when Grindr asks for one", async () => {
		callMethodMock
			.mockRejectedValueOnce({
				kind: "Api",
				message: { code: 18, message: "Invalid captcha token" },
			})
			.mockResolvedValueOnce("captcha-token")
			.mockResolvedValueOnce({ profileId: 456 })
			.mockResolvedValueOnce("keyring");
		render(SignInForm);

		await submitSignIn();

		await waitFor(() =>
			expect(gotoMock).toHaveBeenCalledExactlyOnceWith("/"),
		);
		expect(callMethodMock.mock.calls.map(([method]) => method)).toEqual([
			"sign_in_with_email",
			"mint_recaptcha_token",
			"sign_in_with_email",
			"storage_backend",
		]);
		expect(toastMock.error).not.toHaveBeenCalled();
		expectReady();
	});

	it.each([
		["mintFailed", "Couldn’t complete the captcha check. Try again."],
		["failed", "Couldn’t complete the captcha check. Try again."],
		[
			"grindrMissing",
			"Grindr’s captcha check needs the official Grindr app installed.",
		],
		[
			"unsupportedPlatform",
			"Wrong email or password, or Grindr wants a captcha check, which only works on Android.",
		],
	])(
		"reports a %s captcha without retrying or prompting",
		async (reason, message) => {
			await rejectMint(reason);

			expect(callMethodMock).toHaveBeenCalledTimes(3);
			expect(callMethodMock).toHaveBeenLastCalledWith(
				"mint_recaptcha_token",
				{ action: "login" },
			);
			expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(message);
			expect(gotoMock).not.toHaveBeenCalled();
			expectReady();
		},
	);

	it.each([
		[
			invalidCredentials,
			"Wrong email or password, or Grindr rejected the captcha check.",
		],
		[
			{ kind: "Unauthorized" },
			"Wrong email or password, or Grindr rejected the captcha check.",
		],
		[
			{
				kind: "Api",
				message: { code: 18, message: "Invalid captcha token" },
			},
			"Grindr rejected the captcha check.",
		],
	])(
		"explains a refused CAPTCHA retry exactly once (%j)",
		async (failure, message) => {
			await retryWithCaptcha(failure);

			expect(callMethodMock).toHaveBeenCalledTimes(4);
			expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(message);
			expect(gotoMock).not.toHaveBeenCalled();
			expectReady();
		},
	);

	it("reports an ordinary failure of the CAPTCHA retry exactly once", async () => {
		await retryWithCaptcha({
			kind: "Api",
			message: { code: 9, message: "Something broke" },
		});

		expect(callMethodMock).toHaveBeenCalledTimes(4);
		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			"Error 9: Something broke",
		);
		expectReady();
	});
});
