// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const swapTiles = vi.fn();

const videoCall = $state({
	phase: "active",
	party: { name: "Sam", mediaHash: null },
	facing: "user" as const,
	micMuted: false,
	cameraOff: false,
	cameraReady: true,
	remoteCameraOff: false,
	canFlip: true,
	elapsedSeconds: 0,
	ownMediaHash: null,
	localIsMain: false,
	setLocalTile: vi.fn(),
	setRemoteTile: vi.fn(),
	swapTiles,
	toggleMic: vi.fn(),
	toggleCamera: vi.fn(),
	switchCamera: vi.fn(),
	hangUp: vi.fn(),
	accept: vi.fn(),
});

vi.mock("$lib/video-call/call-state.svelte", () => ({ videoCall }));

const VideoCallOverlay = (await import("./VideoCallOverlay.svelte")).default;

const VIEWPORT = { width: 400, height: 800 };
const TILE = { width: 112, height: 160 };

function overlay() {
	window.innerWidth = VIEWPORT.width;
	window.innerHeight = VIEWPORT.height;
	const { container } = render(VideoCallOverlay);
	const tile = container.querySelector<HTMLElement>('[role="group"]')!;
	tile.setPointerCapture = vi.fn();
	return { tile };
}

/** jsdom lays nothing out, so the tile reports where the drag put it. */
function placeAt(tile: HTMLElement, left: number, top: number) {
	tile.getBoundingClientRect = () =>
		({ left, top, ...TILE }) as unknown as DOMRect;
}

function pointer(tile: HTMLElement, type: string, x: number, y: number) {
	return fireEvent(
		tile,
		new MouseEvent(type, {
			clientX: x,
			clientY: y,
			bubbles: true,
			cancelable: true,
		}),
	);
}

async function dragTo(tile: HTMLElement, x: number, y: number) {
	await pointer(tile, "pointerdown", 0, 0);
	await pointer(tile, "pointermove", x, y);
	placeAt(tile, x, y);
	await pointer(tile, "pointerup", x, y);
}

describe("VideoCallOverlay self tile", () => {
	afterEach(() => {
		swapTiles.mockClear();
		videoCall.phase = "active";
		cleanup();
	});

	it("starts in the bottom-right corner", () => {
		const { tile } = overlay();
		expect(tile.style.right).toBe("1rem");
		expect(tile.style.bottom).toBe("9rem");
		expect(tile.style.top).toBe("auto");
		expect(tile.style.left).toBe("auto");
	});

	it("snaps to the corner nearest where it was dropped", async () => {
		const { tile } = overlay();
		await dragTo(tile, 10, 10);
		expect(tile.style.top).not.toBe("auto");
		expect(tile.style.left).toBe("1rem");
		expect(tile.style.bottom).toBe("auto");
		expect(tile.style.right).toBe("auto");
	});

	it("follows the pointer while dragging", async () => {
		const { tile } = overlay();
		await pointer(tile, "pointerdown", 100, 100);
		await pointer(tile, "pointermove", 140, 60);
		expect(tile.style.translate).toBe("40px -40px");
		await pointer(tile, "pointerup", 140, 60);
		expect(tile.style.translate).toBe("");
	});

	it("keeps its corner when the gesture is too small to be a drag", async () => {
		const { tile } = overlay();
		await pointer(tile, "pointerdown", 100, 100);
		await pointer(tile, "pointermove", 104, 100);
		await pointer(tile, "pointerup", 104, 100);
		expect(tile.style.bottom).toBe("9rem");
		expect(tile.style.right).toBe("1rem");
	});

	it("drops a drag the call ended in the middle of", async () => {
		const { tile } = overlay();
		await pointer(tile, "pointerdown", 100, 100);
		await pointer(tile, "pointermove", 160, 160);
		expect(tile.style.translate).toBe("60px 60px");

		// They hang up mid-drag: no pointerup ever reaches the tile.
		videoCall.phase = "idle";
		await tick();
		videoCall.phase = "active";
		await tick();

		const next = document.querySelector<HTMLElement>('[role="group"]')!;
		expect(next.style.translate).toBe("");
		expect(next.style.bottom).toBe("9rem");
	});

	it("swaps the tiles on a tap but not at the end of a drag", async () => {
		const { tile } = overlay();
		const swap = tile.querySelector<HTMLElement>("button")!;

		swap.click();
		expect(swapTiles).toHaveBeenCalledTimes(1);

		// The click a drag ends with is the browser's, not a tap.
		await dragTo(tile, 10, 10);
		swap.click();
		expect(swapTiles).toHaveBeenCalledTimes(1);

		await pointer(tile, "pointerdown", 10, 10);
		await pointer(tile, "pointerup", 10, 10);
		swap.click();
		expect(swapTiles).toHaveBeenCalledTimes(2);
	});
});
