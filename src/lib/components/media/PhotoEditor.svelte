<script lang="ts">
	import ArrowClockwiseIcon from "phosphor-svelte/lib/ArrowClockwiseIcon";
	import FlipHorizontalIcon from "phosphor-svelte/lib/FlipHorizontalIcon";

	import { Spinner } from "$lib/components/ui/spinner";

	/**
	 * What the uploader downscales a photo to (`photo::encode::MAX_EDGE`).
	 * Editing above it is work thrown away, and on a phone a 12-megapixel canvas
	 * is the difference between a rotation landing at once and taking seconds.
	 */
	const PREVIEW_MAX_EDGE = 1024;

	const MIN_PERCENT = 15;
	const HANDLES = ["nw", "ne", "sw", "se"] as const;

	type Handle = (typeof HANDLES)[number];
	type Step = "flip" | "rotate";
	type Box = { x: number; y: number; w: number; h: number };

	let {
		src,
		watermark = false,
	}: {
		src: string;
		/** Draws the badge the server stamps on, so the crop can be framed
		 *  around it rather than over it. */
		watermark?: boolean;
	} = $props();

	// Flips and rotations are kept as the list of what was asked for, not as the
	// pixels they produced: the preview bakes them at preview size for speed,
	// and the upload replays the same list over the full-resolution original.
	let steps = $state<Step[]>([]);
	let preview = $state<string | null>(null);
	let owned: string[] = [];

	// Percentages of the displayed image, so the box survives a resize and maps
	// onto the natural pixels by the same fractions.
	let crop = $state<Box>({ x: 0, y: 0, w: 100, h: 100 });

	let frame = $state<HTMLElement | null>(null);

	const untouched = $derived(
		steps.length === 0 &&
			crop.x < 0.5 &&
			crop.y < 0.5 &&
			crop.w > 99.5 &&
			crop.h > 99.5,
	);

	$effect(() => () => {
		for (const url of owned) URL.revokeObjectURL(url);
		owned = [];
	});

	function loadImage(url: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const image = new Image();
			image.onload = () => resolve(image);
			image.onerror = () =>
				reject(new Error("Could not read that image"));
			image.src = url;
		});
	}

	function blank(width: number, height: number): HTMLCanvasElement {
		const canvas = document.createElement("canvas");
		canvas.width = Math.max(1, Math.round(width));
		canvas.height = Math.max(1, Math.round(height));
		return canvas;
	}

	/** The image with every flip and rotation applied, at most `maxEdge` across. */
	function baked(
		image: HTMLImageElement,
		maxEdge: number | null,
	): HTMLCanvasElement {
		const { naturalWidth: width, naturalHeight: height } = image;
		const scale =
			maxEdge === null
				? 1
				: Math.min(1, maxEdge / Math.max(width, height));
		let canvas = blank(width * scale, height * scale);
		canvas
			.getContext("2d")
			?.drawImage(image, 0, 0, canvas.width, canvas.height);

		for (const step of steps) {
			const rotate = step === "rotate";
			const next = blank(
				rotate ? canvas.height : canvas.width,
				rotate ? canvas.width : canvas.height,
			);
			const context = next.getContext("2d");
			if (context === null) return canvas;
			context.translate(next.width / 2, next.height / 2);
			if (rotate) context.rotate(Math.PI / 2);
			else context.scale(-1, 1);
			context.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
			canvas = next;
		}
		return canvas;
	}

	function toBlob(
		canvas: HTMLCanvasElement,
		quality: number,
	): Promise<Blob | null> {
		return new Promise((resolve) =>
			canvas.toBlob(resolve, "image/jpeg", quality),
		);
	}

	// One rebuild on the way in and one per transform: the original is never
	// what the screen shows, so a photo off a modern camera is decoded once and
	// then left alone.
	$effect(() => {
		const transformed = steps.length > 0;
		let stale = false;
		void (async () => {
			const image = await loadImage(src);
			if (stale) return;
			const blob = await toBlob(baked(image, PREVIEW_MAX_EDGE), 0.95);
			if (stale || blob === null) return;
			const url = URL.createObjectURL(blob);
			owned.push(url);
			preview = url;
			// A turned photo is a different frame; the box it was cropped to no
			// longer means anything, so it opens up again.
			if (transformed) crop = { x: 0, y: 0, w: 100, h: 100 };
		})();
		return () => {
			stale = true;
		};
	});

	/**
	 * The edited image, or `null` when nothing was done to it — the original
	 * bytes are always the better upload, having been through one encoder fewer.
	 *
	 * Rendered from the original rather than from what is on screen: a tight
	 * crop of a preview-sized copy would hand the uploader fewer pixels than it
	 * is willing to send.
	 */
	export async function render(): Promise<Blob | null> {
		if (untouched) return null;
		const canvas = baked(await loadImage(src), null);
		const out = blank(
			(crop.w / 100) * canvas.width,
			(crop.h / 100) * canvas.height,
		);
		out.getContext("2d")?.drawImage(
			canvas,
			Math.round((crop.x / 100) * canvas.width),
			Math.round((crop.y / 100) * canvas.height),
			out.width,
			out.height,
			0,
			0,
			out.width,
			out.height,
		);
		return await toBlob(out, 0.92);
	}

	function clamp(value: number, low: number, high: number): number {
		return Math.min(Math.max(value, low), high);
	}

	function moved(mode: Handle | "move", from: Box, dx: number, dy: number) {
		if (mode === "move") {
			return {
				...from,
				x: clamp(from.x + dx, 0, 100 - from.w),
				y: clamp(from.y + dy, 0, 100 - from.h),
			};
		}
		const west = mode === "nw" || mode === "sw";
		const north = mode === "nw" || mode === "ne";
		const right = from.x + from.w;
		const bottom = from.y + from.h;
		const x = west ? clamp(from.x + dx, 0, right - MIN_PERCENT) : from.x;
		const y = north ? clamp(from.y + dy, 0, bottom - MIN_PERCENT) : from.y;
		return {
			x,
			y,
			w: west ? right - x : clamp(from.w + dx, MIN_PERCENT, 100 - x),
			h: north ? bottom - y : clamp(from.h + dy, MIN_PERCENT, 100 - y),
		};
	}

	let drag: {
		mode: Handle | "move";
		x: number;
		y: number;
		from: Box;
		rect: DOMRect;
	} | null = null;

	function start(mode: Handle | "move", event: PointerEvent) {
		if (frame === null || !(event.currentTarget instanceof HTMLElement)) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		drag = {
			mode,
			x: event.clientX,
			y: event.clientY,
			from: crop,
			rect: frame.getBoundingClientRect(),
		};
	}

	function drags(event: PointerEvent) {
		if (drag === null) return;
		event.preventDefault();
		crop = moved(
			drag.mode,
			drag.from,
			((event.clientX - drag.x) / drag.rect.width) * 100,
			((event.clientY - drag.y) / drag.rect.height) * 100,
		);
	}

	function end() {
		drag = null;
	}
</script>

<div class="flex flex-col items-center gap-3">
	<!-- `touch-none` so a drag on the crop box crops instead of scrolling the
	     sheet out from under the thumb doing it. -->
	<div
		bind:this={frame}
		class="relative flex touch-none items-center justify-center overflow-hidden rounded-xl bg-black"
	>
		{#if preview === null}
			<div class="flex h-40 w-60 items-center justify-center">
				<Spinner class="size-5 text-white/70" />
			</div>
		{:else}
			<img
				src={preview}
				alt="What is being added"
				draggable="false"
				class="block max-h-[38dvh] w-auto max-w-full object-contain select-none"
			/>
			<!-- Four panes rather than one enormous box-shadow around the crop:
			     the shadow repainted a screen-sized area on every pointer move,
			     which a phone feels. -->
			{@render shade(0, 0, 100, crop.y)}
			{@render shade(0, crop.y + crop.h, 100, 100 - crop.y - crop.h)}
			{@render shade(0, crop.y, crop.x, crop.h)}
			{@render shade(
				crop.x + crop.w,
				crop.y,
				100 - crop.x - crop.w,
				crop.h,
			)}
			<div
				role="presentation"
				class="absolute cursor-move rounded-xl border-3 border-white/60"
				style:left="{crop.x}%"
				style:top="{crop.y}%"
				style:width="{crop.w}%"
				style:height="{crop.h}%"
				onpointerdown={(event) => start("move", event)}
				onpointermove={drags}
				onpointerup={end}
				onpointercancel={end}
			>
				{#each HANDLES as handle (handle)}
					<div
						role="presentation"
						aria-label="Resize crop"
						class={[
							"absolute size-9 touch-none",
							{
								"-top-1 -left-1 cursor-nwse-resize":
									handle === "nw",
								"-top-1 -right-1 cursor-nesw-resize":
									handle === "ne",
								"-bottom-1 -left-1 cursor-nesw-resize":
									handle === "sw",
								"-right-1 -bottom-1 cursor-nwse-resize":
									handle === "se",
							},
						]}
						onpointerdown={(event) => start(handle, event)}
						onpointermove={drags}
						onpointerup={end}
						onpointercancel={end}
					>
						<!-- The grab area is a finger wide; the mark inside it is the
						     corner bracket that shows where the crop actually is. -->
						<span
							class={[
								"absolute size-4 border-white",
								{
									"top-1 left-1 rounded-tl-sm border-t-2 border-l-2":
										handle === "nw",
									"top-1 right-1 rounded-tr-sm border-t-2 border-r-2":
										handle === "ne",
									"bottom-1 left-1 rounded-bl-sm border-b-2 border-l-2":
										handle === "sw",
									"right-1 bottom-1 rounded-br-sm border-r-2 border-b-2":
										handle === "se",
								},
							]}
						></span>
					</div>
				{/each}
				{#if watermark}
					<span
						class="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/65 px-2 py-1 text-caption font-semibold text-white"
					>
						just now
					</span>
				{/if}
			</div>
		{/if}
	</div>

	<div class="flex items-center justify-center gap-8">
		<button
			type="button"
			class="cursor-pointer p-1 text-muted-foreground transition-colors not-disabled:hover:text-foreground disabled:opacity-50"
			aria-label="Flip horizontally"
			disabled={preview === null}
			onclick={() => (steps = [...steps, "flip"])}
		>
			<FlipHorizontalIcon class="size-6" />
		</button>
		<button
			type="button"
			class="cursor-pointer p-1 text-muted-foreground transition-colors not-disabled:hover:text-foreground disabled:opacity-50"
			aria-label="Rotate clockwise"
			disabled={preview === null}
			onclick={() => (steps = [...steps, "rotate"])}
		>
			<ArrowClockwiseIcon class="size-6" />
		</button>
	</div>
</div>

{#snippet shade(left: number, top: number, width: number, height: number)}
	<div
		class="pointer-events-none absolute bg-black/50"
		style:left="{left}%"
		style:top="{top}%"
		style:width="{width}%"
		style:height="{height}%"
	></div>
{/snippet}
