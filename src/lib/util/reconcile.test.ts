import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	callMethodMock,
	connectedHandlers,
	droppedHandlers,
	undeliveredHandlers,
} = vi.hoisted(() => ({
	callMethodMock: vi.fn(() => Promise.resolve(1)),
	connectedHandlers: [] as (() => void)[],
	droppedHandlers: [] as ((skipped: number) => void)[],
	undeliveredHandlers: [] as ((event: unknown) => void)[],
}));

vi.mock("$lib/api/methods", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/methods")>()),
	callMethod: callMethodMock,
}));
vi.mock("$lib/ws.svelte", () => ({
	notificationUndeliveredEventSchema: {},
	ws: {
		on(eventType: string, _schema: unknown, handler: (e: unknown) => void) {
			if (eventType === "notification.undelivered")
				undeliveredHandlers.push(handler);
			return Promise.resolve(vi.fn());
		},
		onConnected(handler: () => void) {
			connectedHandlers.push(handler);
			return Promise.resolve(vi.fn());
		},
		onEventsDropped(handler: (skipped: number) => void) {
			droppedHandlers.push(handler);
			return Promise.resolve(vi.fn());
		},
	},
}));

const flushMockSubscriptions = () => vi.advanceTimersByTimeAsync(0);

async function freshReconciler() {
	connectedHandlers.length = 0;
	droppedHandlers.length = 0;
	undeliveredHandlers.length = 0;
	vi.resetModules();
	const { reconciler } = await import("./reconcile");
	await flushMockSubscriptions();
	return reconciler;
}

function dropEvents(skipped: number) {
	const [handler] = droppedHandlers;
	if (!handler) throw new Error("nothing subscribed to ws:events-dropped");
	handler(skipped);
}

function undeliveredNotification() {
	const [handler] = undeliveredHandlers;
	if (!handler)
		throw new Error("nothing subscribed to notification.undelivered");
	handler({ type: "notification.undelivered", payload: null });
}

function reconnect() {
	const [handler] = connectedHandlers;
	if (!handler) throw new Error("nothing subscribed to ws:connected");
	handler();
}

describe("Reconciler resync after dropped websocket events", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("reconciles immediately when no reconcile is in the throttle window", async () => {
		const reconciler = await freshReconciler();
		const handler = vi.fn();
		reconciler.subscribe(handler);

		dropEvents(3);
		await flushMockSubscriptions();

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("defers a resync that lands inside the throttle window instead of dropping it", async () => {
		const reconciler = await freshReconciler();
		const handler = vi.fn();
		reconciler.subscribe(handler);

		dropEvents(3);
		await flushMockSubscriptions();
		expect(handler).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1200);
		dropEvents(7);
		await flushMockSubscriptions();
		expect(handler).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(800);
		expect(handler).toHaveBeenCalledTimes(2);
	});

	it("coalesces a burst of drops into a single resync", async () => {
		const reconciler = await freshReconciler();
		const handler = vi.fn();
		reconciler.subscribe(handler);

		dropEvents(3);
		await flushMockSubscriptions();
		expect(handler).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1000);
		dropEvents(256);
		dropEvents(256);
		dropEvents(256);

		await vi.advanceTimersByTimeAsync(2000);
		expect(handler).toHaveBeenCalledTimes(2);
	});

	it("skips the pending resync when a reconnect reconcile lands after the drop and already covers it", async () => {
		const reconciler = await freshReconciler();
		const handler = vi.fn();
		reconciler.subscribe(handler);

		dropEvents(3);
		await flushMockSubscriptions();
		expect(handler).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1200);
		dropEvents(7);

		await vi.advanceTimersByTimeAsync(800);
		reconnect();
		reconnect();
		await flushMockSubscriptions();
		expect(handler).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(2000);
		expect(handler).toHaveBeenCalledTimes(2);
	});
});

describe("Reconciler resync after an undelivered notification", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	// The server holding events it could not deliver means anything may be
	// stale, not just messages — the same position dropped events leave us in.
	it("resyncs when the server reports it could not deliver an event", async () => {
		const reconciler = await freshReconciler();
		const handler = vi.fn();
		reconciler.subscribe(handler);

		undeliveredNotification();
		await vi.advanceTimersByTimeAsync(0);

		expect(handler).toHaveBeenCalledTimes(1);
	});
});
