import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetNowForTesting, setNowForTesting } from "$lib/util/clock";
import {
	matchViewers,
	rememberPhotos,
	rememberView,
	resetViewerMatchesForTesting,
} from "./viewer-matches";

const { files, prefs } = vi.hoisted(() => ({
	files: new Map<string, Uint8Array>(),
	prefs: { matchHiddenViewers: true, account: 1 },
}));

vi.mock("$lib/app-data", () => ({
	existsAppDataFile: (path: string) => Promise.resolve(files.has(path)),
	readAppDataFile: (path: string) => Promise.resolve(files.get(path)),
	removeAppDataFile: (path: string) => Promise.resolve(files.delete(path)),
	writeAppDataFileAtomic: ({
		path,
		content,
	}: {
		path: string;
		content: Uint8Array;
	}) => Promise.resolve(void files.set(path, content)),
}));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferences: () =>
		Promise.resolve({ matchHiddenViewers: prefs.matchHiddenViewers }),
	preferencesAccount: () => prefs.account,
}));

const A = "a".repeat(40);
const B = "b".repeat(40);
const DAY = 24 * 60 * 60 * 1000;

let clock = 1_000_000_000_000;

function matchPhotos(hashes: string[]) {
	return matchViewers(hashes.map((hash) => ({ hash, lastViewed: null })));
}

function matchViewedAt(lastViewed: number) {
	return matchViewers([{ hash: null, lastViewed }]).then(([match]) => match);
}

beforeEach(() => {
	files.clear();
	prefs.matchHiddenViewers = true;
	prefs.account = 1;
	clock = 1_000_000_000_000;
	setNowForTesting(() => clock);
	resetViewerMatchesForTesting();
});

afterEach(() => {
	resetNowForTesting();
});

describe("viewer matches", () => {
	it("matches a hash to the profile seen with it", async () => {
		await rememberPhotos([{ profileId: 7, hash: A, displayName: "Sam" }]);
		const [hit, miss] = await matchPhotos([A, B]);
		expect(hit).toMatchObject({ profileId: 7, displayName: "Sam" });
		expect(miss).toBeNull();
	});

	it("keeps the newest profile for a reused hash", async () => {
		await rememberPhotos([{ profileId: 7, hash: A, displayName: "Sam" }]);
		await rememberPhotos([{ profileId: 8, hash: A }]);
		expect((await matchPhotos([A]))[0]).toMatchObject({
			profileId: 8,
			displayName: null,
		});
	});

	it("keeps a known name when a later sighting has none", async () => {
		await rememberPhotos([{ profileId: 7, hash: A, displayName: "Sam" }]);
		await rememberPhotos([{ profileId: 7, hash: A }]);
		expect((await matchPhotos([A]))[0]?.displayName).toBe("Sam");
	});

	it("forgets entries after 30 days", async () => {
		await rememberPhotos([{ profileId: 7, hash: A }]);
		clock += 31 * DAY;
		expect(await matchPhotos([A])).toEqual([null]);
	});

	it("does nothing while turned off", async () => {
		prefs.matchHiddenViewers = false;
		await rememberPhotos([{ profileId: 7, hash: A }]);
		prefs.matchHiddenViewers = true;
		expect(await matchPhotos([A])).toEqual([null]);
	});

	it("matches a photo-less preview by its view time", async () => {
		const at = clock - 60_000;
		await rememberPhotos([{ profileId: 7, hash: A, displayName: "Sam" }]);
		await rememberView({ profileId: 7, at });
		expect(await matchViewedAt(at + 1500)).toMatchObject({
			profileId: 7,
			displayName: "Sam",
		});
		expect(await matchViewedAt(at + 3000)).toBeNull();
	});

	it("leaves a view time alone when two viewers are that close", async () => {
		const at = clock - 60_000;
		await rememberView({ profileId: 7, at });
		await rememberView({ profileId: 8, at: at + 1000 });
		expect(await matchViewedAt(at)).toBeNull();
	});

	it("prefers the photo hash over the view time", async () => {
		const at = clock - 60_000;
		await rememberPhotos([{ profileId: 7, hash: A }]);
		await rememberView({ profileId: 8, at });
		const [match] = await matchViewers([{ hash: A, lastViewed: at }]);
		expect(match?.profileId).toBe(7);
	});

	it("forgets view times after 30 days", async () => {
		const at = clock;
		await rememberView({ profileId: 7, at });
		clock += 31 * DAY;
		expect(await matchViewedAt(at)).toBeNull();
	});

	it("keeps each account's list apart and persists it", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
			await rememberPhotos([{ profileId: 7, hash: A }]);
			await rememberView({ profileId: 9, at: clock });
			await vi.runAllTimersAsync();
			expect(files.has("viewer-matches.1.data")).toBe(true);

			prefs.account = 2;
			expect(await matchPhotos([A])).toEqual([null]);

			prefs.account = 1;
			resetViewerMatchesForTesting();
			expect((await matchPhotos([A]))[0]?.profileId).toBe(7);
			expect((await matchViewedAt(clock))?.profileId).toBe(9);
		} finally {
			vi.useRealTimers();
		}
	});
});
