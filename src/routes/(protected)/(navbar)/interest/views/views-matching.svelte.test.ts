import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getAccountPreferencesMock,
	getProfilesMock,
	getViewsMock,
	markBlockedProfilesUnviewableMock,
	matchViewersMock,
	reconcileHandlers,
	setAccountPreferencesMock,
	showErrorToastMock,
	subscriptions,
	unlistenViewMock,
	unsubscribeReconcileMock,
	viewHandlers,
} = vi.hoisted(() => ({
	getAccountPreferencesMock: vi.fn(),
	getProfilesMock: vi.fn(),
	getViewsMock: vi.fn(),
	markBlockedProfilesUnviewableMock: vi.fn(() => Promise.resolve()),
	matchViewersMock: vi.fn((previews: unknown[]) =>
		Promise.resolve(
			previews.map(
				(): {
					profileId: number;
					displayName: string | null;
					seenAt: number;
				} | null => null,
			),
		),
	),
	reconcileHandlers: [] as (() => void | Promise<void>)[],
	setAccountPreferencesMock: vi.fn(),
	showErrorToastMock: vi.fn(),
	subscriptions: [] as {
		eventType: string;
		schema: { parse(payload: unknown): unknown };
	}[],
	unlistenViewMock: vi.fn(),
	unsubscribeReconcileMock: vi.fn(),
	viewHandlers: [] as ((event: unknown) => void)[],
}));

vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/api/interest/views", () => ({ getViews: getViewsMock }));
vi.mock("$lib/api/users/profiles", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/users/profiles")>()),
	getProfiles: getProfilesMock,
}));
vi.mock("$lib/interest/viewer-matches", () => ({
	matchViewers: matchViewersMock,
	notePhotos: vi.fn(),
	noteView: vi.fn(),
}));
vi.mock("$lib/api/settings/account", () => ({
	getAccountPreferences: getAccountPreferencesMock,
	setAccountPreferences: setAccountPreferencesMock,
}));
vi.mock("$lib/api/browse/blocks", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/browse/blocks")>()),
	markBlockedProfilesUnviewable: markBlockedProfilesUnviewableMock,
}));
vi.mock("$lib/util/reconcile", () => ({
	reconciler: {
		subscribe(handler: () => void | Promise<void>) {
			reconcileHandlers.push(handler);
			return unsubscribeReconcileMock;
		},
	},
}));
import { clearAccountCaches } from "$lib/api/account-caches";
import type { ViewerProfile, ViewPreview } from "$lib/model/interest/views";
import { resetViewsCacheForTesting, ViewsState } from "./views-state.svelte";

vi.mock("$lib/ws.svelte", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/ws.svelte")>()),
	ws: {
		on(
			eventType: string,
			schema: { parse(payload: unknown): unknown },
			handler: (event: unknown) => void,
		) {
			if (eventType === "viewed_me.v1.new_view_received") {
				subscriptions.push({ eventType, schema });
				viewHandlers.push(handler);
			}
			return Promise.resolve(unlistenViewMock);
		},
	},
}));

function emitView(payload: unknown) {
	const subscription = subscriptions.find(
		({ eventType }) => eventType === "viewed_me.v1.new_view_received",
	);
	if (!subscription) throw new Error("view subscription was not registered");
	viewHandlers[0]?.(subscription.schema.parse(payload));
}

function profile(
	profileId: number,
	overrides: Partial<ViewerProfile> = {},
): ViewerProfile {
	return {
		distance: null,
		profileImageMediaHash: null,
		isFavorite: false,
		lastViewed: 1_710_000_000_000 + profileId,
		isSecretAdmirer: false,
		viewedCount: { totalCount: 1, maxDisplayCount: 99 },
		profileId,
		displayName: `Profile ${profileId}`,
		onlineUntil: null,
		...overrides,
	};
}

function preview(overrides: Partial<ViewPreview> = {}): ViewPreview {
	return {
		distance: null,
		profileImageMediaHash: null,
		isFavorite: false,
		lastViewed: 1_710_000_000_000,
		isSecretAdmirer: true,
		viewedCount: { totalCount: 3, maxDisplayCount: 99 },
		...overrides,
	};
}

async function waitForLoaded(state: ViewsState) {
	await vi.waitFor(() => expect(state.loading).toBe(false));
}

function viewEvent(profileId: number) {
	return {
		type: "viewed_me.v1.new_view_received",
		notificationId: null,
		ref: null,
		payload: {
			viewedCount: 1,
			mostRecent: {
				profileId,
				photoHash: null,
				timestamp: 1_710_000_000_000 + profileId,
			},
		},
	};
}

beforeEach(() => {
	// Both layers: the account-scoped instance, and the module-level snapshot
	// that seeds the list on a revisit. Leaving either behind leaks state.
	clearAccountCaches();
	resetViewsCacheForTesting();
	getAccountPreferencesMock.mockReset();
	getAccountPreferencesMock.mockResolvedValue({ hideViewedMe: false });
	setAccountPreferencesMock.mockReset();
	setAccountPreferencesMock.mockResolvedValue(undefined);
	getViewsMock.mockReset();
	getProfilesMock.mockReset();
	getProfilesMock.mockImplementation((ids: number[]) =>
		Promise.resolve(
			ids.map((profileId) => ({
				profileId,
				displayName: null,
				medias: null,
				onlineUntil: null,
				distance: null,
			})),
		),
	);
	markBlockedProfilesUnviewableMock.mockClear();
	showErrorToastMock.mockReset();
	unlistenViewMock.mockReset();
	unsubscribeReconcileMock.mockReset();
	reconcileHandlers.length = 0;
	subscriptions.length = 0;
	viewHandlers.length = 0;
});

describe("ViewsState matching", () => {
	it("turns a preview whose photo was seen before into its profile", async () => {
		const hash = "a".repeat(40);
		matchViewersMock.mockResolvedValueOnce([
			{ profileId: 42, displayName: "Sam", seenAt: 0 },
			null,
		]);
		getViewsMock.mockResolvedValue({
			profiles: [profile(1)],
			previews: [preview({ profileImageMediaHash: hash }), preview()],
		});

		const state = new ViewsState();
		await waitForLoaded(state);

		expect(state.views.map((entry) => entry.type)).toEqual([
			"profile",
			"matched",
			"preview",
		]);
		expect(state.views[1]).toMatchObject({
			viewer: { profileId: 42, displayName: "Sam" },
		});
		expect(state.total).toBe(3);
	});

	it("fills a matched tile from the viewer's profile", async () => {
		const photo = "c".repeat(40);
		matchViewersMock.mockResolvedValueOnce([
			{ profileId: 42, displayName: "Old name", seenAt: 0 },
		]);
		getProfilesMock.mockResolvedValueOnce([
			{
				profileId: 42,
				displayName: "Sam",
				medias: [{ mediaHash: photo }],
				onlineUntil: 1_800_000_000_000,
				distance: 50,
			},
		]);
		getViewsMock.mockResolvedValue({ profiles: [], previews: [preview()] });

		const state = new ViewsState();
		await waitForLoaded(state);

		expect(getProfilesMock).toHaveBeenCalledWith([42]);
		expect(state.views[0]).toMatchObject({
			type: "matched",
			key: "matched:42",
			viewer: {
				profileId: 42,
				displayName: "Sam",
				profileImageMediaHash: photo,
				onlineUntil: 1_800_000_000_000,
			},
		});
	});

	it("keeps a match blurred when its profile is gone", async () => {
		matchViewersMock.mockResolvedValueOnce([
			{ profileId: 42, displayName: "Sam", seenAt: 0 },
		]);
		getProfilesMock.mockResolvedValueOnce([]);
		getViewsMock.mockResolvedValue({ profiles: [], previews: [preview()] });

		const state = new ViewsState();
		await waitForLoaded(state);

		expect(state.views.map((entry) => entry.type)).toEqual(["preview"]);
	});

	it("keeps the match when the profile lookup fails", async () => {
		matchViewersMock.mockResolvedValueOnce([
			{ profileId: 42, displayName: "Sam", seenAt: 0 },
		]);
		getProfilesMock.mockRejectedValueOnce(new Error("offline"));
		getViewsMock.mockResolvedValue({ profiles: [], previews: [preview()] });

		const state = new ViewsState();
		await waitForLoaded(state);

		expect(state.views[0]).toMatchObject({
			type: "matched",
			viewer: { profileId: 42, displayName: "Sam" },
		});
	});

	it("moves a matched viewer to the top on a live view, keeping its name", async () => {
		matchViewersMock.mockResolvedValueOnce([
			{ profileId: 42, displayName: "Sam", seenAt: 0 },
		]);
		getViewsMock.mockResolvedValue({
			profiles: [profile(1)],
			previews: [preview({ lastViewed: 1 })],
		});
		const state = new ViewsState();
		await waitForLoaded(state);

		emitView(viewEvent(42));

		expect(state.views).toHaveLength(2);
		expect(state.views[0]).toMatchObject({
			type: "profile",
			profile: {
				profileId: 42,
				displayName: "Sam",
				viewedCount: { totalCount: 4 },
			},
		});
	});

	it("replaces a blurred preview with the same photo on a live view", async () => {
		const hash = "d".repeat(40);
		getViewsMock.mockResolvedValue({
			profiles: [],
			previews: [preview({ profileImageMediaHash: hash, lastViewed: 1 })],
		});
		const state = new ViewsState();
		await waitForLoaded(state);

		emitView({
			...viewEvent(7),
			payload: {
				viewedCount: 1,
				mostRecent: { profileId: 7, photoHash: hash, timestamp: 2 },
			},
		});

		expect(state.views).toHaveLength(1);
		expect(state.views[0]).toMatchObject({
			type: "profile",
			profile: { profileId: 7, viewedCount: { totalCount: 4 } },
		});
	});

	it("orders every kind of tile by when they viewed", async () => {
		matchViewersMock.mockResolvedValueOnce([
			{ profileId: 42, displayName: "Sam", seenAt: 0 },
			null,
		]);
		getViewsMock.mockResolvedValue({
			profiles: [profile(1, { lastViewed: 100 })],
			previews: [
				preview({ lastViewed: 300 }),
				preview({ lastViewed: 200 }),
			],
		});

		const state = new ViewsState();
		await waitForLoaded(state);

		expect(state.views.map((entry) => entry.type)).toEqual([
			"matched",
			"preview",
			"profile",
		]);
	});
});
