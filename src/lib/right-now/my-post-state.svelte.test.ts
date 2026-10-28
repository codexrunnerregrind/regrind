import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getEntitlementsMock,
	getActiveRightNowPostMock,
	createRightNowPostMock,
	updateRightNowPostMock,
	activeGeohashMock,
	getAccountPreferencesMock,
	getNowMock,
} = vi.hoisted(() => ({
	getEntitlementsMock: vi.fn(),
	getActiveRightNowPostMock: vi.fn(),
	createRightNowPostMock: vi.fn(),
	updateRightNowPostMock: vi.fn(),
	activeGeohashMock: vi.fn(),
	getAccountPreferencesMock: vi.fn(),
	getNowMock: vi.fn(),
}));

vi.mock("$lib/api/right-now", () => ({
	getEntitlements: getEntitlementsMock,
	getActiveRightNowPost: getActiveRightNowPostMock,
	createRightNowPost: createRightNowPostMock,
	updateRightNowPost: updateRightNowPostMock,
}));
vi.mock("$lib/util/now", () => ({ getNow: getNowMock }));
vi.mock("$lib/api/settings/account", () => ({
	getAccountPreferences: getAccountPreferencesMock,
}));
vi.mock("$lib/app-data/preferences.svelte", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("$lib/app-data/preferences.svelte")
	>()),
	getActiveGeohashSnapshot: activeGeohashMock,
}));

import { myRightNowPost } from "./my-post-state.svelte";

const NOW = 1_780_000_000_000;
const HOUR = 60 * 60_000;

const POST = { id: 42, profileId: 1, activeText: "around", hosting: false };
const RUNNING = { ...POST, expiration: NOW + HOUR };
const LAPSED = { ...POST, expiration: NOW - 1 };

const DRAFT = { text: " around ", hosting: false, media: [] };

const PREFERENCES = {
	locationSearchOptOut: false,
	showOnMap: false,
	mapLocationFuzzRadius: null,
};

beforeEach(() => {
	myRightNowPost.reset();
	getEntitlementsMock.mockReset();
	getActiveRightNowPostMock.mockReset();
	createRightNowPostMock.mockReset();
	updateRightNowPostMock.mockReset();
	activeGeohashMock.mockReset();
	getAccountPreferencesMock.mockReset();
	getNowMock.mockReset();
	getNowMock.mockReturnValue(NOW);
	getAccountPreferencesMock.mockResolvedValue(PREFERENCES);
	getEntitlementsMock.mockResolvedValue({ rightNow: 1 });
	getActiveRightNowPostMock.mockResolvedValue(null);
	createRightNowPostMock.mockResolvedValue(POST);
	updateRightNowPostMock.mockResolvedValue(undefined);
	// Somewhere in the Atlantic, precise enough to decode back to itself.
	activeGeohashMock.mockReturnValue("ezs42");
	vi.spyOn(console, "error").mockImplementation(() => {});
});

async function loaded() {
	void myRightNowPost.refresh();
	await vi.waitFor(() => expect(myRightNowPost.loading).toBe(false));
}

describe("my right now post", () => {
	it("loads the entitlement and the post that is up", async () => {
		getActiveRightNowPostMock.mockResolvedValue(POST);

		await loaded();

		expect(myRightNowPost.allowed).toBe(true);
		expect(myRightNowPost.hasPost).toBe(true);
	});

	it("does not stack a refresh on one already in flight", async () => {
		void myRightNowPost.refresh();
		void myRightNowPost.refresh();
		await vi.waitFor(() => expect(myRightNowPost.loading).toBe(false));

		expect(getActiveRightNowPostMock).toHaveBeenCalledTimes(1);
	});

	it("drops text moderation refused once refreshed", async () => {
		getActiveRightNowPostMock.mockResolvedValue(POST);
		await loaded();
		getActiveRightNowPostMock.mockResolvedValue({
			...POST,
			activeText: null,
		});

		await myRightNowPost.refresh();

		expect(myRightNowPost.post?.activeText).toBeNull();
	});

	it("still shows a post when the entitlement call fails", async () => {
		getEntitlementsMock.mockRejectedValue(new Error("nope"));
		getActiveRightNowPostMock.mockResolvedValue(POST);

		await loaded();

		expect(myRightNowPost.allowed).toBe(false);
		expect(myRightNowPost.hasPost).toBe(true);
	});

	it("posts the trimmed text at the location the app is using", async () => {
		await loaded();

		await myRightNowPost.create(DRAFT);

		const [sentPost] = createRightNowPostMock.mock.calls[0] as [
			Record<string, unknown>,
		];
		expect(sentPost.text).toBe("around");
		expect(sentPost.shareLocation).toBe("DISTANCE_ONLY");
		expect(sentPost.lat).toBeCloseTo(42.6, 1);
		expect(sentPost.lon).toBeCloseTo(-5.6, 1);
		expect(myRightNowPost.hasPost).toBe(true);
	});

	it("shares nothing about a location it does not have", async () => {
		activeGeohashMock.mockReturnValue(null);
		await loaded();

		await myRightNowPost.create(DRAFT);

		const [sentPost] = createRightNowPostMock.mock.calls[0] as [
			Record<string, unknown>,
		];
		expect(sentPost.shareLocation).toBe("NONE");
		expect(sentPost.lat).toBeNull();
		expect(sentPost.lon).toBeNull();
	});

	it("puts the post on the map when the account is on the map", async () => {
		getAccountPreferencesMock.mockResolvedValue({
			...PREFERENCES,
			showOnMap: true,
			mapLocationFuzzRadius: 500,
		});
		await loaded();

		await myRightNowPost.create(DRAFT);

		const [sentPost] = createRightNowPostMock.mock.calls[0] as [
			Record<string, unknown>,
		];
		expect(sentPost.shareLocation).toBe("DISTANCE_AND_MAP");
		// The same fuzzing the account already applies to its pin.
		expect(sentPost.locationRadius).toBe(500);
	});

	it("shares no location for an account that opted out of location search", async () => {
		getAccountPreferencesMock.mockResolvedValue({
			...PREFERENCES,
			locationSearchOptOut: true,
		});
		await loaded();

		await myRightNowPost.create(DRAFT);

		const [sentPost] = createRightNowPostMock.mock.calls[0] as [
			Record<string, unknown>,
		];
		expect(sentPost.shareLocation).toBe("NONE");
	});

	it("counts the allowance down as a post goes up", async () => {
		getEntitlementsMock.mockResolvedValue({ rightNow: 2 });
		await loaded();
		expect(myRightNowPost.remaining).toBe(2);

		await myRightNowPost.create(DRAFT);

		expect(myRightNowPost.remaining).toBe(1);
	});

	it("reads the post back when the create response makes no sense of it", async () => {
		createRightNowPostMock.mockResolvedValue(null);
		getActiveRightNowPostMock
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(POST);
		await loaded();

		await myRightNowPost.create(DRAFT);

		// Otherwise a post that is genuinely running would look like no post, and
		// there would be nothing on screen to end it with.
		expect(myRightNowPost.hasPost).toBe(true);
	});

	it("sends an emptied post as no text rather than a blank line", async () => {
		await loaded();

		await myRightNowPost.create({ ...DRAFT, text: "   " });

		const [sentPost] = createRightNowPostMock.mock.calls[0] as [
			Record<string, unknown>,
		];
		expect(sentPost.text).toBeNull();
	});

	it("patches the post that is up and keeps the change locally", async () => {
		getActiveRightNowPostMock.mockResolvedValue(POST);
		await loaded();

		await myRightNowPost.update({
			...DRAFT,
			text: "hosting",
			hosting: true,
		});

		expect(updateRightNowPostMock).toHaveBeenCalledWith({
			postId: 42,
			patch: {
				text: "hosting",
				hosting: true,
				shareLocation: "DISTANCE_ONLY",
				media: [],
			},
		});
		expect(myRightNowPost.post?.activeText).toBe("hosting");
		expect(myRightNowPost.post?.hosting).toBe(true);
	});

	it("hides rather than deletes, and forgets the post either way", async () => {
		getActiveRightNowPostMock.mockResolvedValue(POST);
		await loaded();

		await myRightNowPost.hide();

		expect(updateRightNowPostMock).toHaveBeenCalledWith({
			postId: 42,
			patch: { hidden: true },
		});
		expect(myRightNowPost.hasPost).toBe(false);
	});

	it("leaves the post alone when the update fails", async () => {
		getActiveRightNowPostMock.mockResolvedValue(POST);
		updateRightNowPostMock.mockRejectedValue(new Error("nope"));
		await loaded();

		await expect(myRightNowPost.hide()).rejects.toThrow("nope");
		expect(myRightNowPost.hasPost).toBe(true);
		expect(myRightNowPost.busy).toBe(false);
	});

	it("knows the allowance is not its own zero until the API answers", async () => {
		getEntitlementsMock.mockResolvedValue({ rightNow: 2 });
		expect(myRightNowPost.loaded).toBe(false);
		expect(myRightNowPost.remaining).toBe(0);

		await loaded();

		// The button shows the count only once it means something.
		expect(myRightNowPost.loaded).toBe(true);
		expect(myRightNowPost.remaining).toBe(2);
	});

	it("keeps a post that still has its hour to run", async () => {
		getActiveRightNowPostMock.mockResolvedValue(RUNNING);

		await loaded();

		expect(myRightNowPost.hasPost).toBe(true);
		expect(myRightNowPost.lapsed).toBe(false);
	});

	it("reads a post whose hour is up as no post", async () => {
		getActiveRightNowPostMock.mockResolvedValue(LAPSED);

		await loaded();

		// Otherwise the button stays on "Edit post" and reads "Expired" instead of
		// offering a new one.
		expect(myRightNowPost.hasPost).toBe(false);
		expect(myRightNowPost.lapsed).toBe(true);
	});

	it("brings the allowance back when the post runs out", async () => {
		getEntitlementsMock.mockResolvedValueOnce({ rightNow: 0 });
		getEntitlementsMock.mockResolvedValue({ rightNow: 1 });
		getActiveRightNowPostMock.mockResolvedValueOnce(LAPSED);
		getActiveRightNowPostMock.mockResolvedValue(null);
		await loaded();
		expect(myRightNowPost.allowed).toBe(false);

		myRightNowPost.lapse();
		await vi.waitFor(() => expect(myRightNowPost.allowed).toBe(true));

		// The allowance was spent on the post that just ended, so the stale count
		// would have shown the button locked with a post going spare.
		expect(myRightNowPost.lapsed).toBe(false);
	});

	it("refetches once for the post that ran out", async () => {
		getActiveRightNowPostMock.mockResolvedValue(LAPSED);
		await loaded();

		myRightNowPost.lapse();
		await vi.waitFor(() => expect(myRightNowPost.loading).toBe(false));
		myRightNowPost.lapse();
		myRightNowPost.lapse();

		// The API keeps handing the lapsed post back, so an unguarded refetch would
		// go round for as long as the screen is open.
		expect(getActiveRightNowPostMock).toHaveBeenCalledTimes(2);
	});
});
