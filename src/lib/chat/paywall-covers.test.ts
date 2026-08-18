import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getAlbumsPaywallContentMock } = vi.hoisted(() => ({
	getAlbumsPaywallContentMock: vi.fn(),
}));

vi.mock("$lib/api/messaging/albums", () => ({
	getAlbumsPaywallContent: getAlbumsPaywallContentMock,
}));

import { resetNowForTesting, setNowForTesting } from "$lib/util/clock";
import { clearPaywallCoverCache, paywallCoverUrl } from "./paywall-covers";

let clock = 0;

function entry(albumId: number, overrides: Record<string, unknown> = {}) {
	return {
		albumId,
		paywallCoverUrl: `https://cdn.example.com/${albumId}.cover?Signature=a`,
		paywallUrls: [],
		...overrides,
	};
}

beforeEach(() => {
	clock = 1_000_000;
	setNowForTesting(() => clock);
	clearPaywallCoverCache();
	getAlbumsPaywallContentMock.mockReset();
});

afterEach(() => {
	resetNowForTesting();
});

describe("paywallCoverUrl", () => {
	it("finds the album's blurred cover in the owner's teaser", async () => {
		getAlbumsPaywallContentMock.mockResolvedValue([entry(7)]);

		await expect(
			paywallCoverUrl({ albumId: 7, ownerProfileId: 42 }),
		).resolves.toBe("https://cdn.example.com/7.cover?Signature=a");
		expect(getAlbumsPaywallContentMock).toHaveBeenCalledWith(42);
	});

	it("falls back to the first paywall url when there is no cover field", async () => {
		getAlbumsPaywallContentMock.mockResolvedValue([
			entry(7, {
				paywallCoverUrl: null,
				paywallUrls: ["https://cdn.example.com/first.cover"],
			}),
		]);

		await expect(
			paywallCoverUrl({ albumId: 7, ownerProfileId: 42 }),
		).resolves.toBe("https://cdn.example.com/first.cover");
	});

	it("retries unfiltered when the owner's teaser does not have the album", async () => {
		getAlbumsPaywallContentMock
			.mockResolvedValueOnce([entry(1)])
			.mockResolvedValueOnce([entry(7)]);

		await expect(
			paywallCoverUrl({ albumId: 7, ownerProfileId: 42 }),
		).resolves.toBe("https://cdn.example.com/7.cover?Signature=a");
		expect(getAlbumsPaywallContentMock).toHaveBeenNthCalledWith(1, 42);
		expect(getAlbumsPaywallContentMock).toHaveBeenNthCalledWith(2, null);
	});

	it("is null when neither teaser carries the album", async () => {
		getAlbumsPaywallContentMock.mockResolvedValue([entry(1)]);

		await expect(
			paywallCoverUrl({ albumId: 7, ownerProfileId: 42 }),
		).resolves.toBeNull();
	});

	it("skips urls that are not https", async () => {
		getAlbumsPaywallContentMock.mockResolvedValue([
			entry(7, { paywallCoverUrl: "data:image/gif;base64,AAAA" }),
		]);

		await expect(
			paywallCoverUrl({ albumId: 7, ownerProfileId: 42 }),
		).resolves.toBeNull();
	});

	it("answers several bubbles for one owner with a single request", async () => {
		getAlbumsPaywallContentMock.mockResolvedValue([entry(7), entry(8)]);

		const [first, second] = await Promise.all([
			paywallCoverUrl({ albumId: 7, ownerProfileId: 42 }),
			paywallCoverUrl({ albumId: 8, ownerProfileId: 42 }),
		]);

		expect(first).not.toBeNull();
		expect(second).not.toBeNull();
		expect(getAlbumsPaywallContentMock).toHaveBeenCalledTimes(1);
	});

	it("refetches once the signed urls have gone stale", async () => {
		getAlbumsPaywallContentMock.mockResolvedValue([entry(7)]);

		await paywallCoverUrl({ albumId: 7, ownerProfileId: 42 });
		clock += 11 * 60 * 1000;
		await paywallCoverUrl({ albumId: 7, ownerProfileId: 42 });

		expect(getAlbumsPaywallContentMock).toHaveBeenCalledTimes(2);
	});
});
