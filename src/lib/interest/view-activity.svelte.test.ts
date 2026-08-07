import { beforeEach, describe, expect, it, vi } from "vitest";

const { onNewView, subscriptions, unlistenMock, viewHandlers } = vi.hoisted(
	() => ({
		onNewView: vi.fn(),
		subscriptions: [] as {
			eventType: string;
			schema: { parse(payload: unknown): unknown };
		}[],
		unlistenMock: vi.fn(),
		viewHandlers: [] as ((event: unknown) => void)[],
	}),
);

vi.mock("$lib/ws.svelte", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/ws.svelte")>()),
	ws: {
		on(
			eventType: string,
			schema: { parse(payload: unknown): unknown },
			handler: (event: unknown) => void,
		) {
			subscriptions.push({ eventType, schema });
			viewHandlers.push(handler);
			return Promise.resolve(unlistenMock);
		},
	},
}));

import { ViewActivityState } from "./view-activity.svelte";

function emitView(payload: unknown) {
	const subscription = subscriptions.at(-1);
	if (!subscription) throw new Error("view subscription was not registered");
	viewHandlers.at(-1)?.(subscription.schema.parse(payload));
}

function viewEvent(mostRecent: unknown) {
	return {
		type: "viewed_me.v1.new_view_received",
		notificationId: null,
		ref: null,
		payload: { viewedCount: 1, mostRecent },
	};
}

describe("ViewActivityState", () => {
	beforeEach(() => {
		subscriptions.length = 0;
		viewHandlers.length = 0;
		vi.clearAllMocks();
	});

	it("starts clean and badges on a new view", () => {
		const activity = new ViewActivityState({ onNewView });
		expect(activity.hasUnseenViews).toBe(false);

		emitView(
			viewEvent({
				profileId: 42,
				photoHash: "hash",
				timestamp: 1_710_000_000,
			}),
		);

		expect(activity.hasUnseenViews).toBe(true);
		expect(onNewView).toHaveBeenCalledWith({
			profileId: 42,
			photoHash: "hash",
			timestamp: 1_710_000_000,
		});
	});

	it("keeps the badge until it is marked seen", () => {
		const activity = new ViewActivityState({ onNewView });

		emitView(viewEvent({ profileId: 1, photoHash: null, timestamp: 1 }));
		emitView(viewEvent({ profileId: 2, photoHash: null, timestamp: 2 }));
		expect(activity.hasUnseenViews).toBe(true);

		activity.markSeen();
		expect(activity.hasUnseenViews).toBe(false);
		expect(onNewView).toHaveBeenCalledTimes(2);
	});

	it("ignores a count-only event with no viewer", () => {
		const activity = new ViewActivityState({ onNewView });

		emitView(viewEvent(null));

		expect(activity.hasUnseenViews).toBe(false);
		expect(onNewView).not.toHaveBeenCalled();
	});

	it("drops its listener on destroy", async () => {
		const activity = new ViewActivityState({ onNewView });
		activity.destroy();
		await vi.waitFor(() => {
			expect(unlistenMock).toHaveBeenCalled();
		});
	});
});
