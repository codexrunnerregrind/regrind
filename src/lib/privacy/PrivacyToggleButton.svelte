<script lang="ts">
	import { Portal } from "bits-ui";
	import EyeIcon from "phosphor-svelte/lib/EyeIcon";
	import EyeSlashIcon from "phosphor-svelte/lib/EyeSlashIcon";
	import { innerHeight, innerWidth } from "svelte/reactivity/window";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		preferencesSnapshot,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import {
		imagePrivacy,
		imagesHidden,
		toggleImagePrivacy,
	} from "./image-privacy.svelte";

	const SIZE = 48;
	const MARGIN = 8;
	const DRAG_SLOP = 6;
	const EDGE = SIZE / 2 + MARGIN;

	let drag = $state<{
		id: number;
		startX: number;
		startY: number;
		x: number;
		y: number;
		moved: boolean;
	} | null>(null);

	const width = $derived(innerWidth.current ?? 0);
	const height = $derived(innerHeight.current ?? 0);
	// Held until the save lands, so the button doesn't snap back meanwhile.
	let dropped = $state<{ x: number; y: number } | null>(null);
	const saved = $derived(
		dropped ??
			preferencesSnapshot().privacyToggleButtonPosition ?? {
				x: 1,
				y: 0.72,
			},
	);

	function clamp(value: number, max: number): number {
		return Math.min(Math.max(value, EDGE), Math.max(EDGE, max - EDGE));
	}

	const center = $derived({
		x: clamp(drag?.moved ? drag.x : saved.x * width, width),
		y: clamp(drag?.moved ? drag.y : saved.y * height, height),
	});

	function down(event: PointerEvent): void {
		if (drag !== null) return;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		drag = {
			id: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			x: center.x,
			y: center.y,
			moved: false,
		};
	}

	function move(event: PointerEvent): void {
		if (drag?.id !== event.pointerId) return;
		const dx = event.clientX - drag.startX;
		const dy = event.clientY - drag.startY;
		if (!drag.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
		drag = { ...drag, moved: true, x: event.clientX, y: event.clientY };
	}

	function up(event: PointerEvent): void {
		if (drag?.id !== event.pointerId) return;
		const ended = drag;
		drag = null;
		if (event.type === "pointercancel") return;
		if (!ended.moved) {
			void toggleImagePrivacy();
			return;
		}
		// Snap to the nearer side edge.
		const position = {
			x: ended.x < width / 2 ? 0 : 1,
			y: clamp(ended.y, height) / height,
		};
		dropped = position;
		setPreferences({ privacyToggleButtonPosition: position })
			.catch((error) =>
				showErrorToast({
					label: "Couldn't save button position",
					error,
				}),
			)
			.finally(() => {
				if (dropped === position) dropped = null;
			});
	}
</script>

{#if width > 0}
	<!-- On body, above the media viewer and dialogs; a transformed ancestor
	     would otherwise also drag it along with a swipe-back. -->
	<Portal>
		<button
			type="button"
			aria-label={imagesHidden() ? "Show images" : "Hide images"}
			aria-pressed={imagesHidden()}
			disabled={imagePrivacy.pending}
			class={[
				"pointer-events-auto fixed flex -translate-1/2 touch-none items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur-md select-none",
				{
					"scale-110 cursor-grabbing": drag?.moved,
					"cursor-grab": !drag?.moved,
					"transition-[left,top] duration-200 ease-out":
						drag === null,
				},
			]}
			style:width="{SIZE}px"
			style:height="{SIZE}px"
			style:left="{center.x}px"
			style:top="clamp(calc(var(--safe-area-top) + {EDGE}px), {center.y}px,
			calc(100dvh - var(--safe-area-bottom) - {EDGE}px))"
			style:z-index="calc(var(--z-index-drop) - 1)"
			onpointerdown={down}
			onpointermove={move}
			onpointerup={up}
			onpointercancel={up}
			onkeydown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					void toggleImagePrivacy();
				}
			}}
			oncontextmenu={(event) => event.preventDefault()}
		>
			{#if imagesHidden()}
				<EyeSlashIcon weight="fill" class="size-6" />
			{:else}
				<EyeIcon weight="fill" class="size-6" />
			{/if}
		</button>
	</Portal>
{/if}
