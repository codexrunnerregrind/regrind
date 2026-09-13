import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CheckReport } from "./flow";

const { addonUpdates, updatesManager, updatesApi, toasts } = vi.hoisted(() => ({
	addonUpdates: {
		checkNow: vi.fn<(options: unknown) => Promise<CheckReport>>(),
		withdrawUpdate: vi.fn<() => Promise<void>>(),
	},
	updatesManager: {
		checkForUpdateNow: vi.fn<(options: unknown) => Promise<CheckReport>>(),
	},
	updatesApi: { getInstalledVersion: vi.fn<() => Promise<string | null>>() },
	toasts: {
		showProblem:
			vi.fn<(problem: { title: string; body?: string }) => void>(),
		showUpToDate: vi.fn<(title: string) => void>(),
		showNotice: vi.fn<(title: string) => void>(),
	},
}));

vi.mock("./addon.svelte", () => ({ addonUpdates }));
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

beforeEach(() => {
	vi.clearAllMocks();
	updatesApi.getInstalledVersion.mockResolvedValue("1.1.0");
	updatesManager.checkForUpdateNow.mockResolvedValue("current");
	addonUpdates.checkNow.mockResolvedValue("current");
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
		expect(addonUpdates.checkNow).toHaveBeenCalledOnce();
	});

	it("checks the app and the add-on quietly on a self-managed build", async () => {
		await checkAfterOptIn(selfManagedBuild);

		expect(updatesManager.checkForUpdateNow).toHaveBeenCalledWith({
			reportFailure: false,
		});
		expect(addonUpdates.checkNow).toHaveBeenCalledWith({
			reportFailure: false,
		});
	});

	it("checks only the app where no add-on installs", async () => {
		await checkAfterOptIn({ selfManaged: true, addonAvailable: false });

		expect(updatesManager.checkForUpdateNow).toHaveBeenCalledOnce();
		expect(addonUpdates.checkNow).not.toHaveBeenCalled();
	});

	it("does not ask about an add-on that is not installed", async () => {
		updatesApi.getInstalledVersion.mockResolvedValue(null);

		await checkAfterOptIn(storeBuild);

		expect(addonUpdates.checkNow).not.toHaveBeenCalled();
	});

	it("withdraws the update offer of an add-on that was uninstalled", async () => {
		updatesApi.getInstalledVersion.mockResolvedValue(null);

		await checkAfterOptIn(storeBuild);

		expect(addonUpdates.withdrawUpdate).toHaveBeenCalledOnce();
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
		expect(addonUpdates.checkNow).toHaveBeenCalledWith({
			reportFailure: true,
		});
		expect(addonUpdates.withdrawUpdate).not.toHaveBeenCalled();
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

		expect(addonUpdates.checkNow).not.toHaveBeenCalled();
		expect(toasts.showUpToDate).toHaveBeenCalledExactlyOnceWith(
			"No updates available",
		);
	});

	it("does not claim updates were checked when nothing here is installed", async () => {
		updatesApi.getInstalledVersion.mockResolvedValue(null);

		await checkForUpdatesNow(storeBuild);

		expect(addonUpdates.checkNow).not.toHaveBeenCalled();
		expect(toasts.showUpToDate).not.toHaveBeenCalled();
		expect(toasts.showNotice).toHaveBeenCalledExactlyOnceWith(
			"No add-ons installed",
		);
	});

	it("withdraws the offer of an uninstalled add-on before saying none is installed", async () => {
		updatesApi.getInstalledVersion.mockResolvedValue(null);

		let finishWithdrawing: () => void = () => {};
		addonUpdates.withdrawUpdate.mockReturnValueOnce(
			new Promise((resolve) => {
				finishWithdrawing = resolve;
			}),
		);

		const checking = checkForUpdatesNow(storeBuild);
		await vi.waitFor(() =>
			expect(addonUpdates.withdrawUpdate).toHaveBeenCalledOnce(),
		);
		expect(toasts.showNotice).not.toHaveBeenCalled();

		finishWithdrawing();
		await checking;

		expect(toasts.showNotice).toHaveBeenCalledOnce();
	});

	it("reports an add-on it could not look for instead of calling it current", async () => {
		updatesApi.getInstalledVersion.mockRejectedValue(
			new Error("no plugin"),
		);

		await checkForUpdatesNow(storeBuild);

		expect(addonUpdates.checkNow).not.toHaveBeenCalled();
		expect(toasts.showUpToDate).not.toHaveBeenCalled();
		expect(toasts.showProblem).toHaveBeenCalledExactlyOnceWith({
			title: "Couldn't check for updates",
			body: "Google OAuth app",
		});
	});

	it("does not repeat the Google OAuth app under a title that names it", async () => {
		updatesApi.getInstalledVersion.mockRejectedValue({
			kind: "unsupported",
			detail: { reason: "foreignTarget" },
		});

		await checkForUpdatesNow(storeBuild);

		expect(toasts.showProblem).toHaveBeenCalledExactlyOnceWith({
			title: "The installed Google OAuth app isn't signed by Open Grind. Uninstall it to install the official one.",
			body: undefined,
		});
	});

	it("keeps a failed add-on lookup quiet right after opting in", async () => {
		updatesApi.getInstalledVersion.mockRejectedValue(
			new Error("no plugin"),
		);

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
			addonUpdates.checkNow.mockResolvedValue(addon);

			await checkForUpdatesNow(selfManagedBuild);

			expect(toasts.showUpToDate).not.toHaveBeenCalled();
		},
	);

	it("waits for every check before it settles", async () => {
		let answerAddon: (report: CheckReport) => void = () => {};
		addonUpdates.checkNow.mockReturnValue(
			new Promise((resolve) => {
				answerAddon = resolve;
			}),
		);
		let settled = false;

		const checking = checkForUpdatesNow(selfManagedBuild).then(() => {
			settled = true;
		});
		await vi.waitFor(() =>
			expect(addonUpdates.checkNow).toHaveBeenCalledOnce(),
		);
		expect(settled).toBe(false);

		answerAddon("current");
		await checking;

		expect(toasts.showUpToDate).toHaveBeenCalledOnce();
	});
});
