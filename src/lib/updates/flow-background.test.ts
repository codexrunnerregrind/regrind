import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ComponentKey } from "./components";
import type { Progress } from "./types";
import {
	awaitingPermission,
	flowFor,
	offer,
	progressOf,
	ready,
	resumable,
	settled,
	unpublished,
	updateApiFake,
} from "./updates-test-helpers";

const fake = updateApiFake();
const { api, readiness, emitProgress } = fake;

vi.mock("./index", async () => ({
	...(await import("./types")),
	...(await import("./components")),
	...fake.api,
}));

const HOUR_MS = 60 * 60 * 1000;

let visibility: DocumentVisibilityState = "visible";

function leaveOpenGrind(): void {
	visibility = "hidden";
	document.dispatchEvent(new Event("visibilitychange"));
}

function returnToOpenGrind(): void {
	visibility = "visible";
	document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
	vi.resetModules();
	fake.reset();
	visibility = "visible";
	vi.spyOn(document, "visibilityState", "get").mockImplementation(
		() => visibility,
	);
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("an armed install whose download finishes while Open Grind is hidden", () => {
	async function downloadFinishedWhileAway(
		kind: "install" | "update" = "install",
	) {
		api.checkForUpdate.mockResolvedValue(offer(kind));
		const { flow, view } = await flowFor("google-oauth");
		await flow.installNow();
		leaveOpenGrind();

		readiness["google-oauth"] = ready(kind);
		emitProgress(
			progressOf("google-oauth", { kind, phase: "ready", received: 100 }),
		);
		await settled();
		return { flow, view };
	}

	it("waits for Open Grind to come back before installing", async () => {
		await downloadFinishedWhileAway();

		expect(api.installUpdate).not.toHaveBeenCalled();

		returnToOpenGrind();
		await settled();

		expect(api.installUpdate).toHaveBeenCalledOnce();
		expect(api.installUpdate).toHaveBeenCalledWith("google-oauth");
	});

	it("installs once when the finished download reports ready twice", async () => {
		api.checkForUpdate.mockResolvedValue(offer("install"));
		let finishStarting: (progress: Progress) => void = () => {};
		api.startUpdateDownload.mockImplementationOnce(
			() =>
				new Promise<Progress>((resolve) => {
					finishStarting = resolve;
				}),
		);
		const { flow } = await flowFor("google-oauth");
		const installing = flow.installNow();
		await settled();
		leaveOpenGrind();
		readiness["google-oauth"] = ready("install");
		const finished = progressOf("google-oauth", {
			kind: "install",
			phase: "ready",
			received: 100,
		});

		emitProgress(finished);
		await settled();
		finishStarting(progressOf("google-oauth", { kind: "install" }));
		await installing;
		emitProgress(finished);
		await settled();
		returnToOpenGrind();
		await settled();
		leaveOpenGrind();
		returnToOpenGrind();
		await settled();

		expect(api.installUpdate).toHaveBeenCalledOnce();
	});

	it("tries the install only on the first return", async () => {
		await downloadFinishedWhileAway();
		readiness["google-oauth"] = awaitingPermission("install");

		returnToOpenGrind();
		await settled();
		leaveOpenGrind();
		returnToOpenGrind();
		await settled();

		expect(api.openInstallPermissionSettings).toHaveBeenCalledOnce();
		expect(api.installUpdate).not.toHaveBeenCalled();
	});

	it("does not install a download canceled while Open Grind was away", async () => {
		await downloadFinishedWhileAway();

		emitProgress(
			progressOf("google-oauth", {
				kind: "install",
				phase: "canceled",
				received: 40,
			}),
		);
		await settled();
		returnToOpenGrind();
		await settled();

		expect(api.installUpdate).not.toHaveBeenCalled();
	});

	it("does not install an update withdrawn while Open Grind was away", async () => {
		const { flow } = await downloadFinishedWhileAway("update");

		await flow.withdrawUpdate();
		returnToOpenGrind();
		await settled();

		expect(api.discardStagedUpdate).toHaveBeenCalledWith("google-oauth");
		expect(api.installUpdate).not.toHaveBeenCalled();
	});
});

describe("the hourly check", () => {
	it("leaves a paused first install the user started on screen", async () => {
		const { flow, view } = await flowFor("google-oauth");
		vi.useFakeTimers();
		await flow.start();
		api.checkForUpdate.mockResolvedValue(offer("install"));
		await flow.installNow();
		emitProgress(
			progressOf("google-oauth", {
				kind: "install",
				phase: "canceled",
				received: 40,
			}),
		);
		api.checkForUpdate.mockClear();
		api.checkForUpdate.mockResolvedValue(unpublished);

		await vi.advanceTimersByTimeAsync(HOUR_MS);

		expect(view.events).toEqual(["show:downloading", "show:paused"]);
		expect(api.checkForUpdate).not.toHaveBeenCalled();
	});

	it("keeps an update paused behind a busy queue since launch", async () => {
		readiness["google-oauth"] = resumable("update");
		api.startUpdateDownload.mockRejectedValue({
			kind: "busy",
			detail: { component: "app" },
		});
		api.checkForUpdate.mockResolvedValue(offer("update"));
		const { flow, view } = await flowFor("google-oauth");
		vi.useFakeTimers();
		await flow.start();

		await vi.advanceTimersByTimeAsync(HOUR_MS);

		expect(view.events).toEqual(["show:downloading", "show:paused"]);
	});

	it("keeps an update paused behind a busy queue when the user resumed it", async () => {
		const { flow, view } = await flowFor("google-oauth");
		vi.useFakeTimers();
		await flow.start();
		readiness["google-oauth"] = resumable("update");
		api.startUpdateDownload.mockRejectedValue({
			kind: "busy",
			detail: { component: "app" },
		});
		await flow.installNow();
		const resumed = [...view.events];
		api.checkForUpdate.mockResolvedValue(offer("update"));

		await vi.advanceTimersByTimeAsync(HOUR_MS);

		expect(resumed).toContain("show:paused");
		expect(view.events).toEqual(resumed);
	});

	it("offers a withdrawn update again once the add-on is back", async () => {
		api.checkForUpdate.mockResolvedValue(offer("update"));
		const { flow, view } = await flowFor("google-oauth");
		vi.useFakeTimers();
		await flow.start();
		await flow.withdrawUpdate();

		await vi.advanceTimersByTimeAsync(HOUR_MS);

		expect(view.events).toEqual([
			"show:available",
			"dismiss",
			"show:available",
		]);
	});

	it("offers nothing over an install whose toast was hidden while it awaits its outcome", async () => {
		readiness.app = ready("update", { tag: "v0.2.0" });
		const { flow, view } = await flowFor("app");
		vi.useFakeTimers();
		await flow.start();
		view.activate();
		await vi.advanceTimersByTimeAsync(0);
		view.swipe();
		api.checkForUpdate.mockClear();
		api.checkForUpdate.mockResolvedValue(
			offer("update", { component: "app", tag: "v0.3.0" }),
		);

		await vi.advanceTimersByTimeAsync(HOUR_MS);

		expect(api.checkForUpdate).not.toHaveBeenCalled();
		expect(view.events).toEqual(["show:ready", "show:installing"]);
	});

	describe.each<ComponentKey>(["app", "google-oauth"])(
		"finding the release already offered by the %s flow",
		(component) => {
			const sameRelease = offer("update", { component });
			const newerRelease = offer("update", { component, tag: "v1.3.0" });

			async function pausedDownload() {
				api.checkForUpdate.mockResolvedValue(sameRelease);
				const { flow, view } = await flowFor(component);
				vi.useFakeTimers();
				await flow.start();
				view.activate();
				await vi.advanceTimersByTimeAsync(0);
				emitProgress(
					progressOf(component, { phase: "canceled", received: 40 }),
				);
				return view;
			}

			async function swipedOffer() {
				api.checkForUpdate.mockResolvedValue(sameRelease);
				const { flow, view } = await flowFor(component);
				vi.useFakeTimers();
				await flow.start();
				view.swipe();
				return view;
			}

			it("keeps a paused download paused", async () => {
				const view = await pausedDownload();

				await vi.advanceTimersByTimeAsync(HOUR_MS);

				expect(view.events).toEqual([
					"show:available",
					"show:downloading",
					"show:paused",
				]);
			});

			it("keeps a download resumed at launch paused", async () => {
				api.getUpdateProgress.mockResolvedValue(progressOf(component));
				const { flow, view } = await flowFor(component);
				vi.useFakeTimers();
				await flow.start();
				emitProgress(
					progressOf(component, { phase: "canceled", received: 40 }),
				);
				api.checkForUpdate.mockResolvedValue(sameRelease);

				await vi.advanceTimersByTimeAsync(HOUR_MS);

				expect(view.events).toEqual([
					"show:downloading",
					"show:paused",
				]);
			});

			it("offers the release again after its download toast was swiped", async () => {
				api.checkForUpdate.mockResolvedValue(sameRelease);
				const { flow, view } = await flowFor(component);
				vi.useFakeTimers();
				await flow.start();
				view.activate();
				await vi.advanceTimersByTimeAsync(0);
				emitProgress(progressOf(component, { received: 40 }));
				view.swipe();

				await vi.advanceTimersByTimeAsync(HOUR_MS);

				expect(view.events).toEqual([
					"show:available",
					"show:downloading",
					"show:downloading",
					"show:available",
				]);
			});

			it("keeps a swiped offer away", async () => {
				const view = await swipedOffer();

				await vi.advanceTimersByTimeAsync(HOUR_MS);

				expect(view.events).toEqual(["show:available"]);
			});

			it("replaces a paused download with a newer release", async () => {
				const view = await pausedDownload();
				api.checkForUpdate.mockResolvedValue(newerRelease);

				await vi.advanceTimersByTimeAsync(HOUR_MS);

				expect(view.events.at(-1)).toBe("show:available");
			});

			it("shows a newer release after a swiped offer", async () => {
				const view = await swipedOffer();
				api.checkForUpdate.mockResolvedValue(newerRelease);

				await vi.advanceTimersByTimeAsync(HOUR_MS);

				expect(view.events).toEqual([
					"show:available",
					"show:available",
				]);
			});
		},
	);
});
