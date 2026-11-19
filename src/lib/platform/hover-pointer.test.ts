import { afterEach, describe, expect, it, vi } from "vitest";

import {
	HOVER_POINTER_ROOT_ATTRIBUTE,
	TAP_ECHO_MS,
	trackHoverPointer,
} from "./hover-pointer";

type PointerState = Pick<
	PointerEvent,
	"isTrusted" | "buttons" | "pointerType" | "timeStamp"
>;

const root = document.documentElement;
const releases: (() => void)[] = [];

function pointer(state: Partial<PointerState>): PointerState {
	return {
		isTrusted: true,
		buttons: 0,
		pointerType: "mouse",
		timeStamp: 0,
		...state,
	};
}

function primaryInputHovers(hovers: boolean) {
	vi.spyOn(window, "matchMedia").mockReturnValue({
		matches: hovers,
	} as MediaQueryList);
}

function startTracking() {
	const addEventListener = vi.spyOn(window, "addEventListener");
	const release = trackHoverPointer();
	releases.push(release);
	const registrations = [...addEventListener.mock.calls];
	addEventListener.mockRestore();
	const deliver = ({
		type,
		event,
	}: {
		type: string;
		event: PointerState;
	}) => {
		for (const [registeredType, listener] of registrations) {
			if (registeredType === type) {
				(listener as EventListener)({
					...event,
					type,
				} as unknown as Event);
			}
		}
	};
	return { release, registrations, deliver };
}

afterEach(() => {
	for (const release of releases.splice(0)) release();
	vi.restoreAllMocks();
});

describe("trackHoverPointer", () => {
	it("starts from whether the primary input can hover", () => {
		primaryInputHovers(true);
		startTracking();
		expect(root.hasAttribute(HOVER_POINTER_ROOT_ATTRIBUTE)).toBe(true);

		primaryInputHovers(false);
		startTracking();
		expect(root.hasAttribute(HOVER_POINTER_ROOT_ATTRIBUTE)).toBe(false);
	});

	it.each(["mouse", "pen", ""])(
		"marks the root when a %s pointer moves with nothing pressed",
		(pointerType) => {
			primaryInputHovers(false);
			const { deliver } = startTracking();
			deliver({ type: "pointermove", event: pointer({ pointerType }) });
			expect(root.hasAttribute(HOVER_POINTER_ROOT_ATTRIBUTE)).toBe(true);
		},
	);

	it("ignores a finger's buttonless moves", () => {
		primaryInputHovers(false);
		const { deliver } = startTracking();
		deliver({
			type: "pointermove",
			event: pointer({ pointerType: "touch" }),
		});
		expect(root.hasAttribute(HOVER_POINTER_ROOT_ATTRIBUTE)).toBe(false);
	});

	it.each(["pointerdown", "pointerup"])(
		"ignores the hover moves iOS sends right after a tap's %s",
		(type) => {
			primaryInputHovers(false);
			const { deliver } = startTracking();
			deliver({
				type,
				event: pointer({ pointerType: "touch", timeStamp: 5000 }),
			});
			deliver({
				type: "pointermove",
				event: pointer({ timeStamp: 5000 + TAP_ECHO_MS - 1 }),
			});
			expect(root.hasAttribute(HOVER_POINTER_ROOT_ATTRIBUTE)).toBe(false);

			deliver({
				type: "pointermove",
				event: pointer({ timeStamp: 5000 + TAP_ECHO_MS }),
			});
			expect(root.hasAttribute(HOVER_POINTER_ROOT_ATTRIBUTE)).toBe(true);
		},
	);

	it("ignores moves with a button or contact pressed", () => {
		primaryInputHovers(false);
		const { deliver } = startTracking();
		for (const event of [
			pointer({ buttons: 1, pointerType: "touch" }),
			pointer({ buttons: 1, pointerType: "mouse" }),
			pointer({ buttons: 32, pointerType: "pen" }),
		]) {
			deliver({ type: "pointermove", event });
		}
		expect(root.hasAttribute(HOVER_POINTER_ROOT_ATTRIBUTE)).toBe(false);
	});

	it("clears the mark only when a finger presses", () => {
		primaryInputHovers(true);
		const { deliver } = startTracking();
		for (const pointerType of ["mouse", "pen"]) {
			deliver({
				type: "pointerdown",
				event: pointer({ buttons: 1, pointerType }),
			});
		}
		expect(root.hasAttribute(HOVER_POINTER_ROOT_ATTRIBUTE)).toBe(true);
		deliver({
			type: "pointerdown",
			event: pointer({ buttons: 1, pointerType: "touch" }),
		});
		expect(root.hasAttribute(HOVER_POINTER_ROOT_ATTRIBUTE)).toBe(false);
	});

	it("ignores synthetic pointer events", () => {
		primaryInputHovers(false);
		const { deliver } = startTracking();
		deliver({ type: "pointermove", event: pointer({ isTrusted: false }) });
		expect(root.hasAttribute(HOVER_POINTER_ROOT_ATTRIBUTE)).toBe(false);

		deliver({ type: "pointermove", event: pointer({}) });
		deliver({
			type: "pointerdown",
			event: pointer({ isTrusted: false, pointerType: "touch" }),
		});
		expect(root.hasAttribute(HOVER_POINTER_ROOT_ATTRIBUTE)).toBe(true);
	});

	it("hears pointers before app handlers can stop their propagation", () => {
		const { registrations } = startTracking();
		const capturing = expect.objectContaining({
			capture: true,
			passive: true,
		});
		expect(registrations).toEqual([
			["pointermove", expect.any(Function), capturing],
			["pointerdown", expect.any(Function), capturing],
			["pointerup", expect.any(Function), capturing],
		]);
	});

	it("drops the mark and stops listening once released", () => {
		primaryInputHovers(true);
		const { release, registrations } = startTracking();
		release();
		expect(root.hasAttribute(HOVER_POINTER_ROOT_ATTRIBUTE)).toBe(false);
		for (const [, , options] of registrations) {
			expect((options as AddEventListenerOptions).signal?.aborted).toBe(
				true,
			);
		}
	});
});
