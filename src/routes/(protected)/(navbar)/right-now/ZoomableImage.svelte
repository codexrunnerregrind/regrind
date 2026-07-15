<script lang="ts">
	import { env } from "$env/dynamic/public";
	import { Dialog } from "bits-ui";
	import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";

	let {
		open = $bindable(false),
		src,
		alt = "Image preview",
	}: {
		open: boolean;
		src: string;
		alt?: string;
	} = $props();

	let scale = $state(1);
	let offsetX = $state(0);
	let offsetY = $state(0);
	let isDragging = $state(false);

	const activePointers = new Map<
		number,
		{ clientX: number; clientY: number }
	>();
	let initialPinchDistance = 0;
	let initialScale = 1;
	let startX = 0;
	let startY = 0;

	$effect(() => {
		if (!open) return;

		const onBackGesture = () => {
			open = false;
			return false;
		};

		backGestureEventHandlers.add(onBackGesture);

		return () => {
			backGestureEventHandlers.delete(onBackGesture);
		};
	});

	function getDistance(
		p1: { clientX: number; clientY: number },
		p2: { clientX: number; clientY: number },
	) {
		const dx = p1.clientX - p2.clientX;
		const dy = p1.clientY - p2.clientY;
		return Math.sqrt(dx * dx + dy * dy);
	}

	function clampTranslation(x: number, y: number, currentScale: number) {
		const maxDeltaX = Math.max(0, (window.innerWidth * (currentScale - 1)) / 2);
		const maxDeltaY = Math.max(
			0,
			(window.innerHeight * (currentScale - 1)) / 2,
		);
		return {
			x: Math.min(Math.max(x, -maxDeltaX), maxDeltaX),
			y: Math.min(Math.max(y, -maxDeltaY), maxDeltaY),
		};
	}

	function handlePointerDown(e: PointerEvent) {
		e.preventDefault();
		activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
		(e.target as HTMLElement).setPointerCapture(e.pointerId);

		if (activePointers.size === 1) {
			isDragging = true;
			startX = e.clientX - offsetX;
			startY = e.clientY - offsetY;
		} else if (activePointers.size === 2) {
			isDragging = false;
			const pointers = Array.from(activePointers.values());
			initialPinchDistance = getDistance(pointers[0], pointers[1]);
			initialScale = scale;
		}
	}

	function handlePointerMove(e: PointerEvent) {
		if (!activePointers.has(e.pointerId)) return;
		activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

		if (activePointers.size === 1 && isDragging) {
			const rawX = e.clientX - startX;
			const rawY = e.clientY - startY;
			const clamped = clampTranslation(rawX, rawY, scale);
			offsetX = clamped.x;
			offsetY = clamped.y;
		} else if (activePointers.size === 2) {
			const pointers = Array.from(activePointers.values());
			const currentDistance = getDistance(pointers[0], pointers[1]);

			if (initialPinchDistance > 0) {
				const pinchScale = currentDistance / initialPinchDistance;
				scale = Math.min(Math.max(initialScale * pinchScale, 1), 5);
				const clamped = clampTranslation(offsetX, offsetY, scale);
				offsetX = clamped.x;
				offsetY = clamped.y;
			}
		}
	}

	function handlePointerUp(e: PointerEvent) {
		activePointers.delete(e.pointerId);
		try {
			(e.target as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {}

		if (activePointers.size < 2) {
			initialPinchDistance = 0;
		}

		if (activePointers.size === 0) {
			isDragging = false;
			if (scale <= 1) {
				offsetX = 0;
				offsetY = 0;
			}
		} else if (activePointers.size === 1) {
			const remainingPointer = Array.from(activePointers.entries())[0];
			isDragging = true;
			startX = remainingPointer[1].clientX - offsetX;
			startY = remainingPointer[1].clientY - offsetY;
		}
	}

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const zoomFactor = 0.15;
		const nextScale = Math.min(
			Math.max(scale + (e.deltaY < 0 ? zoomFactor : -zoomFactor), 1),
			5,
		);

		if (nextScale === scale) return;

		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const mouseX = e.clientX - rect.left - rect.width / 2;
		const mouseY = e.clientY - rect.top - rect.height / 2;

		let targetX = offsetX - mouseX * (nextScale / scale - 1);
		let targetY = offsetY - mouseY * (nextScale / scale - 1);

		const clamped = clampTranslation(targetX, targetY, nextScale);
		offsetX = clamped.x;
		offsetY = clamped.y;
		scale = nextScale;
	}

	function resetTransform() {
		scale = 1;
		offsetX = 0;
		offsetY = 0;
		activePointers.clear();
		isDragging = false;
	}
</script>

<Dialog.Root
	onOpenChange={(isOpen) => {
		if (!isOpen) resetTransform();
	}}
	bind:open
>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/90 opacity-0 backdrop-blur-sm transition-opacity duration-[300ms] ease-out data-[state=open]:opacity-100"
		/>

		<Dialog.Content
			class="fixed inset-0 z-50 flex scale-95 items-center justify-center opacity-0 transition-all duration-[300ms] ease-out outline-none select-none data-[state=open]:scale-100 data-[state=open]:opacity-100"
		>
			<div
				class="relative flex h-full w-full items-center justify-center overflow-hidden p-4"
			>
				<Dialog.Close
					class="absolute inset-0 h-full w-full cursor-default bg-transparent text-transparent outline-none"
				>
					Close
				</Dialog.Close>

				<div
					role="application"
					onpointerdown={handlePointerDown}
					onpointermove={handlePointerMove}
					onpointerup={handlePointerUp}
					onpointercancel={handlePointerUp}
					onwheel={handleWheel}
					class="relative z-10 cursor-grab touch-none overflow-hidden active:cursor-grabbing"
					style:transform="translate3d({offsetX}px, {offsetY}px, 0) scale({scale})"
					style:transition={isDragging || activePointers.size === 2
						? "none"
						: "transform 0.1s ease-out"}
				>
					<img
						{src}
						{alt}
						class={[
							"pointer-events-none h-auto max-h-[90vh] w-auto max-w-[90vw] rounded-md object-contain shadow-2xl",
							{
								"blur-2xl": env.PUBLIC_ENABLE_BLUR_EFFECTS,
							},
						]}
						draggable="false"
					/>
				</div>

				<Dialog.Close
					class="absolute top-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900/80 text-white backdrop-blur-sm hover:bg-neutral-800"
				>
					✕ <!-- TODO: Replace with icon -->
				</Dialog.Close>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
