import { encode } from "@msgpack/msgpack";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("svelte-sonner", () => ({ toast: { error: vi.fn() } }));

import {
	existsAppDataFile,
	readAppDataFile,
	writeAppDataFileAtomic,
} from "$lib/app-data";
import {
	clearAccountPreferences,
	getPreferencesSnapshot,
	setPreferences,
	usePreferencesForAccount,
} from "./preferences.svelte";

const GLOBAL = "preferences.data";
const MINE = "preferences.1.data";
const THEIRS = "preferences.2.data";

async function stored(path: string): Promise<Record<string, unknown>> {
	if (!(await existsAppDataFile(path))) return {};
	const { decode } = await import("@msgpack/msgpack");
	return decode(await readAppDataFile(path)) as Record<string, unknown>;
}

async function write(path: string, values: unknown): Promise<void> {
	await writeAppDataFileAtomic({ path, content: encode(values) });
}

describe("preferences split between the app and each account", () => {
	beforeEach(async () => {
		localStorage.clear();
		// Back to "nobody signed in", which is where the app starts.
		await usePreferencesForAccount(null);
	});

	it("keeps one account's location out of another's", async () => {
		await usePreferencesForAccount(1);
		await setPreferences({ geohash: "ezjmgt0hnbcd" });

		await usePreferencesForAccount(2);
		expect(getPreferencesSnapshot().geohash).toBeNull();
		await setPreferences({ geohash: "gcpvj0duqcjt" });

		await usePreferencesForAccount(1);
		expect(getPreferencesSnapshot().geohash).toBe("ezjmgt0hnbcd");
		expect(await stored(MINE)).toMatchObject({ geohash: "ezjmgt0hnbcd" });
		expect(await stored(THEIRS)).toMatchObject({ geohash: "gcpvj0duqcjt" });
	});

	it("shares the look of the app across accounts", async () => {
		await usePreferencesForAccount(1);
		await setPreferences({ accentColor: "purple", themeMode: "light" });

		await usePreferencesForAccount(2);

		expect(getPreferencesSnapshot().accentColor).toBe("purple");
		expect(getPreferencesSnapshot().themeMode).toBe("light");
		expect(await stored(GLOBAL)).toMatchObject({ accentColor: "purple" });
	});

	it("lets each account decide whether it stays online", async () => {
		await usePreferencesForAccount(1);
		await setPreferences({ stayOnline: false });

		await usePreferencesForAccount(2);

		expect(getPreferencesSnapshot().stayOnline).toBe(true);
	});

	it("adopts the values the single-account app left in the shared file", async () => {
		await write(GLOBAL, {
			geohash: "ezjmgt0hnbcd",
			accentColor: "purple",
			stayOnline: false,
		});

		await usePreferencesForAccount(1);

		expect(getPreferencesSnapshot().geohash).toBe("ezjmgt0hnbcd");
		expect(getPreferencesSnapshot().accentColor).toBe("purple");
		expect(getPreferencesSnapshot().stayOnline).toBe(false);
		// Moved, not copied: left behind, they would be inherited by the next
		// account to sign in.
		expect(await stored(GLOBAL)).not.toHaveProperty("geohash");
		expect(await stored(MINE)).toMatchObject({ geohash: "ezjmgt0hnbcd" });
	});

	it("does not hand the first account's location to the second", async () => {
		await write(GLOBAL, { geohash: "ezjmgt0hnbcd" });
		await usePreferencesForAccount(1);

		await usePreferencesForAccount(2);

		expect(getPreferencesSnapshot().geohash).toBeNull();
	});

	it("forgets one account's preferences without touching the others", async () => {
		await usePreferencesForAccount(1);
		await setPreferences({
			geohash: "ezjmgt0hnbcd",
			accentColor: "purple",
		});
		await usePreferencesForAccount(2);
		await setPreferences({ geohash: "gcpvj0duqcjt" });

		await clearAccountPreferences(1);

		expect(await existsAppDataFile(MINE)).toBe(false);
		expect(await stored(THEIRS)).toMatchObject({ geohash: "gcpvj0duqcjt" });
		expect(await stored(GLOBAL)).toMatchObject({ accentColor: "purple" });
	});

	it("writes everything to the shared file while nobody is signed in", async () => {
		await setPreferences({ geohash: "ezjmgt0hnbcd" });

		expect(await stored(GLOBAL)).toMatchObject({ geohash: "ezjmgt0hnbcd" });
		expect(await existsAppDataFile(MINE)).toBe(false);
	});
});
