import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSentTapsMock, getProfilesMock, reconcileHandlers } = vi.hoisted(
	() => ({
		getSentTapsMock: vi.fn(),
		getProfilesMock: vi.fn(),
		reconcileHandlers: [] as (() => void | Promise<void>)[],
	}),
);

vi.mock("$lib/api/interest/taps", () => ({ getSentTaps: getSentTapsMock }));
vi.mock("$lib/api/users/profiles", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/users/profiles")>()),
	getProfiles: getProfilesMock,
}));
vi.mock("$lib/util/reconcile", () => ({
	reconciler: {
		subscribe(handler: () => void | Promise<void>) {
			reconcileHandlers.push(handler);
			return () => {};
		},
	},
}));

import { clearAccountCaches } from "$lib/api/account-caches";
import {
	resetSentTapsCacheForTesting,
	SentTapsState,
} from "./sent-taps-state.svelte";

const AT = 1_710_000_000_000;

function sent(
	receiverId: number,
	overrides: Partial<{
		sentOn: number;
		readOn: number | null;
		deleted: boolean;
		tapType: number | null;
	}> = {},
) {
	return {
		senderId: 1,
		receiverId,
		tapType: 0,
		sentOn: AT + receiverId,
		readOn: null,
		deleted: false,
		...overrides,
	};
}

function profile(profileId: number) {
	return {
		profileId,
		displayName: `Profile ${profileId}`,
		onlineUntil: null,
		distance: 1_000,
		profileImageMediaHash: null,
		isFavorite: false,
	};
}

beforeEach(() => {
	clearAccountCaches();
	resetSentTapsCacheForTesting();
	reconcileHandlers.length = 0;
	getSentTapsMock.mockReset();
	getProfilesMock.mockReset();
	getProfilesMock.mockImplementation((ids: number[]) =>
		Promise.resolve(ids.map(profile)),
	);
	vi.spyOn(console, "error").mockImplementation(() => {});
});

async function loaded() {
	const state = new SentTapsState();
	await vi.waitFor(() => expect(state.loading).toBe(false));
	return state;
}

describe("sent taps state", () => {
	it("lists the recipients newest first, with their profiles filled in", async () => {
		getSentTapsMock.mockResolvedValue([sent(2), sent(9), sent(5)]);

		const state = await loaded();

		expect(state.taps.map((tap) => tap.profileId)).toEqual([9, 5, 2]);
		expect(state.taps[0]?.displayName).toBe("Profile 9");
		expect(state.total).toBe(3);
	});

	it("leaves out taps we took back", async () => {
		getSentTapsMock.mockResolvedValue([
			sent(2),
			sent(3, { deleted: true }),
		]);

		const state = await loaded();

		expect(state.taps.map((tap) => tap.profileId)).toEqual([2]);
		// The profile of a deleted tap is not even looked up.
		expect(getProfilesMock).toHaveBeenCalledWith([2]);
	});

	it("keeps one row per person, showing the latest tap", async () => {
		getSentTapsMock.mockResolvedValue([
			sent(4, { sentOn: AT + 100, tapType: 1 }),
			sent(4, { sentOn: AT + 50, tapType: 2 }),
		]);

		const state = await loaded();

		expect(state.taps).toHaveLength(1);
		expect(state.taps[0]?.tapType).toBe(1);
		expect(state.taps[0]?.sentOn).toBe(AT + 100);
	});

	it("drops a tap whose recipient no longer resolves", async () => {
		getSentTapsMock.mockResolvedValue([sent(7), sent(8)]);
		getProfilesMock.mockResolvedValue([profile(7)]);

		const state = await loaded();

		expect(state.taps.map((tap) => tap.profileId)).toEqual([7]);
	});

	it("carries whether they opened it", async () => {
		getSentTapsMock.mockResolvedValue([
			sent(1, { readOn: AT + 5 }),
			sent(2),
		]);

		const state = await loaded();

		const byId = new Map(state.taps.map((tap) => [tap.profileId, tap]));
		expect(byId.get(1)?.readOn).toBe(AT + 5);
		expect(byId.get(2)?.readOn).toBeNull();
	});
});
