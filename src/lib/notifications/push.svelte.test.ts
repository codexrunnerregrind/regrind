import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRestMock } = vi.hoisted(() => ({ fetchRestMock: vi.fn() }));

vi.mock("$lib/api/transport", () => ({ fetchRest: fetchRestMock }));
vi.mock("$lib/platform/os", () => ({ isAndroidPlatform: () => true }));
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	preferencesSnapshot: () => ({ notifyMessages: true, notifyTaps: true }),
}));

import { push } from "$lib/notifications/push.svelte";

const TOKEN = "instance-id:APA91bExample";
const DAY_MS = 24 * 60 * 60 * 1000;

function ok() {
	return { assertOk: () => {} };
}

async function settle() {
	await Promise.resolve();
	await Promise.resolve();
}

beforeEach(() => {
	vi.useFakeTimers();
	localStorage.clear();
	fetchRestMock.mockReset();
	fetchRestMock.mockResolvedValue(ok());
	window.__REGRIND_FCM_TOKEN = TOKEN;
});

afterEach(() => {
	push.stop();
	delete window.__REGRIND_FCM_TOKEN;
	vi.useRealTimers();
});

describe("push token registration", () => {
	it("posts the token once and reports the device registered", async () => {
		push.start(1);
		await settle();

		expect(fetchRestMock).toHaveBeenCalledTimes(1);
		expect(fetchRestMock.mock.calls[0]?.[0]).toBe("/v3/gcm-push-tokens");
		expect(fetchRestMock.mock.calls[0]?.[1]).toMatchObject({
			body: { vendorProvidedIdentifier: "instance-id", token: TOKEN },
		});
		expect(push.registration).toBe("registered");
	});

	it("skips a re-post while the last sync is recent", async () => {
		push.start(1);
		await settle();
		push.stop();

		push.start(1);
		await settle();
		expect(fetchRestMock).toHaveBeenCalledTimes(1);
	});

	it("re-posts once the record of the last sync goes stale", async () => {
		push.start(1);
		await settle();
		push.stop();

		vi.setSystemTime(Date.now() + 4 * DAY_MS);
		push.start(1);
		await settle();
		expect(fetchRestMock).toHaveBeenCalledTimes(2);
	});

	it("re-posts for another account on the same device", async () => {
		push.start(1);
		await settle();
		push.stop();

		push.start(2);
		await settle();
		expect(fetchRestMock).toHaveBeenCalledTimes(2);
	});

	it("retries a failed sync on a backoff", async () => {
		fetchRestMock.mockRejectedValueOnce(new Error("offline"));
		push.start(1);
		await settle();
		expect(push.registration).toBe("failed");

		await vi.advanceTimersByTimeAsync(5_000);
		await settle();
		expect(fetchRestMock).toHaveBeenCalledTimes(2);
		expect(push.registration).toBe("registered");
	});

	it("keeps a failed sync retryable by hand", async () => {
		fetchRestMock.mockRejectedValue(new Error("offline"));
		push.start(1);
		await settle();
		expect(push.registration).toBe("failed");

		fetchRestMock.mockResolvedValue(ok());
		await push.retry();
		expect(push.registration).toBe("registered");
	});
});
