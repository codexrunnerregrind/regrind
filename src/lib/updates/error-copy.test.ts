import { describe, expect, it } from "vitest";

import { APP_COMPONENT, GOOGLE_OAUTH_COMPONENT } from "./components";
import {
	installFailedText,
	noReleaseText,
	problemBody,
	unsupportedIsFixable,
	unsupportedText,
	updateErrorText,
} from "./error-copy";

const foreignTarget = {
	kind: "unsupported",
	detail: { reason: "foreignTarget" },
};

describe("copy for an installed package signed by someone else", () => {
	it("names the app generically for the app itself", () => {
		expect(unsupportedText({ reason: "foreignTarget" })).toBe(
			"The installed app isn't signed by ReGrind",
		);
		expect(
			updateErrorText(foreignTarget, {
				fallback: "fallback",
				component: APP_COMPONENT,
			}),
		).toBe("The installed app isn't signed by ReGrind");
	});

	it("tells the user to uninstall the impostor Google OAuth app", () => {
		const text =
			"The installed Google OAuth app isn't signed by Open Grind. Uninstall it to install the official one.";

		expect(
			unsupportedText(
				{ reason: "foreignTarget" },
				{ component: GOOGLE_OAUTH_COMPONENT },
			),
		).toBe(text);
		for (const kind of ["install", "update"] as const) {
			expect(
				updateErrorText(foreignTarget, {
					fallback: "fallback",
					component: GOOGLE_OAUTH_COMPONENT,
					kind,
				}),
			).toBe(text);
		}
	});

	it("counts as something the user can fix", () => {
		expect(unsupportedIsFixable({ reason: "foreignTarget" })).toBe(true);
	});
});

describe("copy for an Open Grind build signed by someone else", () => {
	it("blames this build, not the Google OAuth app, when the Google OAuth app cannot be installed", () => {
		const text =
			"This copy of ReGrind isn't signed by Open Grind, so it can't install the Google OAuth app";

		expect(
			unsupportedText(
				{ reason: "foreignSigner" },
				{ component: GOOGLE_OAUTH_COMPONENT },
			),
		).toBe(text);
		expect(
			updateErrorText(
				{ kind: "unsupported", detail: { reason: "foreignSigner" } },
				{ fallback: "fallback", component: GOOGLE_OAUTH_COMPONENT },
			),
		).toBe(text);
	});

	it("keeps the app's own wording", () => {
		expect(unsupportedText({ reason: "foreignSigner" })).toBe(
			"This build was not signed by ReGrind",
		);
	});
});

describe("copy for a release index with nothing to install", () => {
	it("says no release is published yet instead of blaming the device", () => {
		expect(noReleaseText({ component: GOOGLE_OAUTH_COMPONENT })).toBe(
			"No Google OAuth app release is published yet",
		);
		expect(noReleaseText({ component: APP_COMPONENT })).toBe(
			"No ReGrind release is published yet",
		);
	});

	it("stays distinct from a device the release does not cover", () => {
		for (const component of [
			APP_COMPONENT,
			GOOGLE_OAUTH_COMPONENT,
		] as const) {
			expect(noReleaseText({ component })).not.toBe(
				unsupportedText(
					{ reason: "noReleaseArtifacts" },
					{ component },
				),
			);
		}
	});
});

describe("copy for an install the system refused", () => {
	it.each([
		[APP_COMPONENT, "install", "Couldn't install the update"],
		[APP_COMPONENT, "update", "Couldn't install the update"],
		[
			GOOGLE_OAUTH_COMPONENT,
			"install",
			"Couldn't install the Google OAuth app",
		],
		[
			GOOGLE_OAUTH_COMPONENT,
			"update",
			"Couldn't update the Google OAuth app",
		],
	] as const)(
		"words a %s %s by what was installed",
		(component, kind, text) => {
			expect(installFailedText({ code: 5, component, kind })).toBe(text);
			expect(installFailedText({ component, kind })).toBe(text);
		},
	);

	it("names full storage for status -4", () => {
		const code = -4;
		expect(
			installFailedText({
				code,
				component: APP_COMPONENT,
				kind: "update",
			}),
		).toBe("Not enough storage to install the update");
		expect(
			installFailedText({
				code,
				component: GOOGLE_OAUTH_COMPONENT,
				kind: "install",
			}),
		).toBe("Not enough storage to install the Google OAuth app");
		expect(
			installFailedText({
				code,
				component: GOOGLE_OAUTH_COMPONENT,
				kind: "update",
			}),
		).toBe("Not enough storage to update the Google OAuth app");
	});

	it.each([1, 4, 6, -18, -20, -110])(
		"stays generic for status %i",
		(code) => {
			expect(
				installFailedText({
					code,
					component: GOOGLE_OAUTH_COMPONENT,
					kind: "install",
				}),
			).toBe("Couldn't install the Google OAuth app");
		},
	);
});

describe("copy for a download refused while another one runs", () => {
	it.each([
		[
			GOOGLE_OAUTH_COMPONENT,
			APP_COMPONENT,
			"Wait for the ReGrind update to finish downloading",
		],
		[
			APP_COMPONENT,
			GOOGLE_OAUTH_COMPONENT,
			"Wait for the Google OAuth app to finish downloading",
		],
	] as const)(
		"tells the %s flow which download is running",
		(component, running, text) => {
			expect(
				updateErrorText(
					{ kind: "busy", detail: { component: running } },
					{ fallback: "fallback", component },
				),
			).toBe(text);
		},
	);

	it.each([
		["no detail", { kind: "busy" }],
		["an unknown component", { kind: "busy", detail: { component: "x" } }],
	])("keeps the generic text for %s", (_, error) => {
		expect(
			updateErrorText(error, {
				fallback: "fallback",
				component: GOOGLE_OAUTH_COMPONENT,
			}),
		).toBe("Another download is already running");
	});
});

describe("copy for a release replaced after its one automatic retry", () => {
	it("asks the user to try again instead of promising a download", () => {
		for (const component of [
			APP_COMPONENT,
			GOOGLE_OAUTH_COMPONENT,
		] as const) {
			expect(
				updateErrorText(
					{ kind: "assetReplaced" },
					{ fallback: "fallback", component },
				),
			).toBe("The release changed during the download. Try again.");
		}
	});
});

describe("the subject line under a problem", () => {
	it.each([
		"Couldn't install the Google OAuth app",
		"Couldn't update the Google OAuth app",
		"Failed to verify the Google OAuth app",
		"No Google OAuth app release is published yet",
		"The installed Google OAuth app isn't signed by Open Grind. Uninstall it to install the official one.",
	])("is left out when the title says %s", (title) => {
		expect(problemBody({ component: GOOGLE_OAUTH_COMPONENT, title })).toBe(
			undefined,
		);
	});

	it.each([
		"Couldn't reach the release server",
		"Another download is already running",
		"Finish the other install first",
		"The release changed during the download. Try again.",
	])("names the Google OAuth app under %s", (title) => {
		expect(problemBody({ component: GOOGLE_OAUTH_COMPONENT, title })).toBe(
			"Google OAuth app",
		);
	});

	it("is never added for the app", () => {
		expect(
			problemBody({
				component: APP_COMPONENT,
				title: "Couldn't reach the release server",
			}),
		).toBe(undefined);
	});
});
