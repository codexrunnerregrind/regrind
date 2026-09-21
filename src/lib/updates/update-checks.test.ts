import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CheckReport } from "./flow";

const { googleOAuth, recaptcha, updatesManager, updatesApi, toasts } =
	vi.hoisted(() => {
		const flow = (component: string) => ({
			component,
			checkNow: vi.fn<(options: unknown) => Promise<CheckReport>>(),
			withdrawUpdate: vi.fn<() => Promise<void>>(),
		});
		return {
			googleOAuth: flow("google-oauth"),
			recaptcha: flow("recaptcha"),
			updatesManager: {
				checkForUpdateNow:
					vi.fn<(options: unknown) => Promise<CheckReport>>(),
			},
			updatesApi: {
				getInstalledVersion:
					vi.fn<(component: string) => Promise<string | null>>(),
			},
			toasts: {
				showProblem:
					vi.fn<
						(problem: { title: string; body?: string }) => void
					>(),
				showUpToDate: vi.fn<(title: string) => void>(),
				showNotice: vi.fn<(title: string) => void>(),
			},
		};
	});

vi.mock("./addon.svelte", () => ({ addonFlows: [googleOAuth, recaptcha] }));
vi.mock("./updates-manager", () => updatesManager);
vi.mock("./index", () => updatesApi);
vi.mock("./toasts", () => toasts);

import {
	automaticChecksSetting,
	checkAfterOptIn,
	checkForUpdatesNow,
	manualCheckOffered,
} from "./update-checks";

const storeBuild = {
	selfManaged: false,
	unsupportedReason: null,
	addonAvailable: true,
};
const selfManagedBuild = { selfManaged: true, addonAvailable: true };

type Lookup = string | null | { rejects: unknown };

function installed(byComponent: Record<string, Lookup>) {
	const lookups = new Map(
		Object.entries(byComponent).map(([component, lookup]) => {
			const read = vi.fn<() => Promise<string | null>>();
			if (lookup !== null && typeof lookup === "object") {
				read.mockRejectedValue(lookup.rejects);
			} else {
				read.mockResolvedValue(lookup);
			}
			return [component, read] as const;
		}),
	);
	updatesApi.getInstalledVersion.mockImplementation(
		(component) => lookups.get(component)?.() ?? Promise.resolve(null),
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	installed({ "google-oauth": "1.1.0" });
	updatesManager.checkForUpdateNow.mockResolvedValue("current");
	googleOAuth.checkNow.mockResolvedValue("current");
	recaptcha.checkNow.mockResolvedValue("current");
});

describe("the automatic update checks switch", () => {
	it("speaks for the app and its add-ons on a self-managed build", () => {
		expect(
			automaticChecksSetting({ ...storeBuild, selfManaged: true }),
		).toEqual({
			title: "Check updates automatically",
			description:
				"Periodically request updates for ReGrind and its add-ons from git.opengrind.org. No personally identifiable information is sent, no requests are stored or analyzed.",
			blocked: false,
		});
	});

	it("names only Open Grind where no add-on installs", () => {
		expect(
			automaticChecksSetting({
				selfManaged: true,
				unsupportedReason: null,
				addonAvailable: false,
			}).description,
		).toBe(
			"Periodically request updates for ReGrind from git.opengrind.org. No personally identifiable information is sent, no requests are stored or analyzed.",
		);
	});

	it("speaks only for the add-ons on a store build", () => {
		expect(automaticChecksSetting(storeBuild)).toEqual({
			title: "Check add-on updates automatically",
			description:
				"Periodically ask git.opengrind.org whether newer versions of your installed add-ons are published. ReGrind itself isn't updated from here. No personally identifiable information is sent, no requests are stored or analyzed.",
			blocked: false,
		});
	});

	it("stays usable for the add-ons when the app cannot update itself", () => {
		const setting = automaticChecksSetting({
			...storeBuild,
			unsupportedReason:
				"Open Grind can't tell whether it may update itself",
		});

		expect(setting.blocked).toBe(false);
		expect(setting.title).toBe("Check add-on updates automatically");
		expect(setting.description).toMatch(
			/^Open Grind can't tell whether it may update itself\. Periodically ask git\.opengrind\.org whether newer versions of your installed add-ons/,
		);
	});

	it("blocks the switch and says why when nothing here can be checked", () => {
		expect(
			automaticChecksSetting({
				selfManaged: false,
				unsupportedReason:
					"Open Grind can't install the update in its directory",
				addonAvailable: false,
			}),
		).toEqual({
			title: "Check updates automatically",
			description: "Open Grind can't install the update in its directory",
			blocked: true,
		});
	});
});

describe("checking right after opting in", () => {
	it("leaves the app to its store and checks only the add-on", async () => {
		await checkAfterOptIn(storeBuild);

		expect(updatesManager.checkForUpdateNow).not.toHaveBeenCalled();
		expect(googleOAuth.checkNow).toHaveBeenCalledOnce();
	});

	it("checks the app and the add-on quietly on a self-managed build", async () => {
		await checkAfterOptIn(selfManagedBuild);

		expect(updatesManager.checkForUpdateNow).toHaveBeenCalledWith({
			reportFailure: false,
		});
		expect(googleOAuth.checkNow).toHaveBeenCalledWith({
			reportFailure: false,
		});
	});

	it("checks only the app where no add-on installs", async () => {
		await checkAfterOptIn({ selfManaged: true, addonAvailable: false });

		expect(updatesManager.checkForUpdateNow).toHaveBeenCalledOnce();
		expect(googleOAuth.checkNow).not.toHaveBeenCalled();
	});

	it("does not ask about an add-on that is not installed", async () => {
		updatesApi.getInstalledVersion.mockResolvedValue(null);

		await checkAfterOptIn(storeBuild);

		expect(googleOAuth.checkNow).not.toHaveBeenCalled();
	});

	it("withdraws the update offer of an add-on that was uninstalled", async () => {
		updatesApi.getInstalledVersion.mockResolvedValue(null);

		await checkAfterOptIn(storeBuild);

		expect(googleOAuth.withdrawUpdate).toHaveBeenCalledOnce();
	});

	it("never says that nothing was found", async () => {
		await checkAfterOptIn(selfManagedBuild);

		expect(toasts.showUpToDate).not.toHaveBeenCalled();
	});
});

describe("the Check for updates action", () => {
	it("is offered wherever the app or an add-on updates from here", () => {
		expect(manualCheckOffered(selfManagedBuild)).toBe(true);
		expect(manualCheckOffered(storeBuild)).toBe(true);
		expect(
			manualCheckOffered({ selfManaged: true, addonAvailable: false }),
		).toBe(true);
		expect(
			manualCheckOffered({ selfManaged: false, addonAvailable: false }),
		).toBe(false);
	});

	it("checks the app and the installed add-on and reports failures", async () => {
		await checkForUpdatesNow(selfManagedBuild);

		expect(updatesManager.checkForUpdateNow).toHaveBeenCalledWith({
			reportFailure: true,
		});
		expect(googleOAuth.checkNow).toHaveBeenCalledWith({
			reportFailure: true,
		});
		expect(googleOAuth.withdrawUpdate).not.toHaveBeenCalled();
	});

	it("says no updates are available when everything is current", async () => {
		await checkForUpdatesNow(selfManagedBuild);

		expect(toasts.showUpToDate).toHaveBeenCalledExactlyOnceWith(
			"No updates available",
		);
	});

	it("leaves the app to its store", async () => {
		await checkForUpdatesNow(storeBuild);

		expect(updatesManager.checkForUpdateNow).not.toHaveBeenCalled();
		expect(toasts.showUpToDate).toHaveBeenCalledOnce();
	});

	it("skips an add-on that is not installed", async () => {
		updatesApi.getInstalledVersion.mockResolvedValue(null);

		await checkForUpdatesNow(selfManagedBuild);

		expect(googleOAuth.checkNow).not.toHaveBeenCalled();
		expect(toasts.showUpToDate).toHaveBeenCalledExactlyOnceWith(
			"No updates available",
		);
	});

	it("does not claim updates were checked when nothing here is installed", async () => {
		updatesApi.getInstalledVersion.mockResolvedValue(null);

		await checkForUpdatesNow(storeBuild);

		expect(googleOAuth.checkNow).not.toHaveBeenCalled();
		expect(toasts.showUpToDate).not.toHaveBeenCalled();
		expect(toasts.showNotice).toHaveBeenCalledExactlyOnceWith(
			"No add-ons installed",
		);
	});

	it("withdraws the offer of an uninstalled add-on before saying none is installed", async () => {
		updatesApi.getInstalledVersion.mockResolvedValue(null);

		let finishWithdrawing: () => void = () => {};
		googleOAuth.withdrawUpdate.mockReturnValueOnce(
			new Promise((resolve) => {
				finishWithdrawing = resolve;
			}),
		);

		const checking = checkForUpdatesNow(storeBuild);
		await vi.waitFor(() =>
			expect(googleOAuth.withdrawUpdate).toHaveBeenCalledOnce(),
		);
		expect(toasts.showNotice).not.toHaveBeenCalled();

		finishWithdrawing();
		await checking;

		expect(toasts.showNotice).toHaveBeenCalledOnce();
	});

	it("reports an add-on it could not look for instead of calling it current", async () => {
		installed({ "google-oauth": { rejects: new Error("no plugin") } });

		await checkForUpdatesNow(storeBuild);

		expect(googleOAuth.checkNow).not.toHaveBeenCalled();
		expect(toasts.showUpToDate).not.toHaveBeenCalled();
		expect(toasts.showProblem).toHaveBeenCalledExactlyOnceWith({
			title: "Couldn't check for updates",
			body: "Google OAuth app",
		});
	});

	it("does not repeat the Google OAuth app under a title that names it", async () => {
		installed({
			"google-oauth": {
				rejects: {
					kind: "unsupported",
					detail: { reason: "foreignTarget" },
				},
			},
		});

		await checkForUpdatesNow(storeBuild);

		expect(toasts.showProblem).toHaveBeenCalledExactlyOnceWith({
			title: "The installed Google OAuth app isn't signed by Open Grind. Uninstall it to install the official one.",
			body: undefined,
		});
	});

	it("keeps a failed add-on lookup quiet right after opting in", async () => {
		installed({ "google-oauth": { rejects: new Error("no plugin") } });

		await checkAfterOptIn(storeBuild);

		expect(toasts.showProblem).not.toHaveBeenCalled();
	});

	it.each<[CheckReport, CheckReport]>([
		["offered", "current"],
		["current", "offered"],
		["failed", "current"],
		["current", "failed"],
		["busy", "current"],
		["current", "busy"],
	])(
		"stays quiet about the rest when the app reports %s and the add-on %s",
		async (app, addon) => {
			updatesManager.checkForUpdateNow.mockResolvedValue(app);
			googleOAuth.checkNow.mockResolvedValue(addon);

			await checkForUpdatesNow(selfManagedBuild);

			expect(toasts.showUpToDate).not.toHaveBeenCalled();
		},
	);

	it("waits for every check before it settles", async () => {
		let answerAddon: (report: CheckReport) => void = () => {};
		googleOAuth.checkNow.mockReturnValue(
			new Promise((resolve) => {
				answerAddon = resolve;
			}),
		);
		let settled = false;

		const checking = checkForUpdatesNow(selfManagedBuild).then(() => {
			settled = true;
		});
		await vi.waitFor(() =>
			expect(googleOAuth.checkNow).toHaveBeenCalledOnce(),
		);
		expect(settled).toBe(false);

		answerAddon("current");
		await checking;

		expect(toasts.showUpToDate).toHaveBeenCalledOnce();
	});
});

describe("the reCAPTCHA helper", () => {
	it("is checked once it is installed", async () => {
		installed({ "google-oauth": "1.1.0", recaptcha: "1.1.0" });

		await checkForUpdatesNow(storeBuild);

		expect(recaptcha.checkNow).toHaveBeenCalledExactlyOnceWith({
			reportFailure: true,
		});
		expect(googleOAuth.checkNow).toHaveBeenCalledOnce();
	});

	it("is never asked about while it is not installed", async () => {
		await checkForUpdatesNow(storeBuild);
		await checkAfterOptIn(storeBuild);

		expect(recaptcha.checkNow).not.toHaveBeenCalled();
		expect(recaptcha.withdrawUpdate).toHaveBeenCalledTimes(2);
	});

	it("is checked on its own when the Google OAuth app is not installed", async () => {
		installed({ recaptcha: "1.1.0" });

		await checkForUpdatesNow(storeBuild);

		expect(googleOAuth.checkNow).not.toHaveBeenCalled();
		expect(recaptcha.checkNow).toHaveBeenCalledOnce();
		expect(toasts.showNotice).not.toHaveBeenCalled();
		expect(toasts.showUpToDate).toHaveBeenCalledExactlyOnceWith(
			"No updates available",
		);
	});

	it("is checked quietly right after opting in", async () => {
		installed({ recaptcha: "1.1.0" });

		await checkAfterOptIn(storeBuild);

		expect(recaptcha.checkNow).toHaveBeenCalledExactlyOnceWith({
			reportFailure: false,
		});
	});

	it("keeps the rest quiet while it offers an update", async () => {
		installed({ "google-oauth": "1.1.0", recaptcha: "1.0.0" });
		recaptcha.checkNow.mockResolvedValue("offered");

		await checkForUpdatesNow(selfManagedBuild);

		expect(toasts.showUpToDate).not.toHaveBeenCalled();
	});

	it("is named under the problem when its lookup fails", async () => {
		installed({
			"google-oauth": "1.1.0",
			recaptcha: { rejects: new Error("no plugin") },
		});

		await checkForUpdatesNow(storeBuild);

		expect(recaptcha.checkNow).not.toHaveBeenCalled();
		expect(toasts.showProblem).toHaveBeenCalledExactlyOnceWith({
			title: "Couldn't check for updates",
			body: "reCAPTCHA helper",
		});
	});

	it("is not asked about where add-ons can't install", async () => {
		installed({ "google-oauth": "1.1.0", recaptcha: "1.1.0" });

		await checkForUpdatesNow({ selfManaged: true, addonAvailable: false });

		expect(updatesApi.getInstalledVersion).not.toHaveBeenCalled();
		expect(recaptcha.checkNow).not.toHaveBeenCalled();
	});
});
