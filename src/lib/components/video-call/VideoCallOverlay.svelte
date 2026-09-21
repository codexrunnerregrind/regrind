<script lang="ts">
	import {
		CameraRotateIcon,
		MicrophoneIcon,
		MicrophoneSlashIcon,
		PhoneSlashIcon,
		VideoCameraIcon,
		VideoCameraSlashIcon,
	} from "phosphor-svelte";
	import type { Snippet } from "svelte";

	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import { formatCallDuration } from "$lib/model/messaging/video-calls";
	import { videoCall } from "$lib/video-call/call-state.svelte";

	const name = $derived(videoCall.party?.name ?? "Someone");
	const active = $derived(videoCall.phase === "active");
	const incoming = $derived(videoCall.phase === "incoming");

	// Named on our own tile so that "flip" has a visible effect even on the
	// frames where the two cameras look alike.
	const facingLabel = $derived(
		videoCall.facing === "user" ? "front" : "back",
	);

	// Our tile is dragged to whichever corner keeps it off their face, and
	// stays there for the next call: the overlay outlives every call.
	type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

	const SIDE_INSET = "1rem";
	// Clear of the name and timer at the top, of the controls at the bottom.
	const TOP_INSET = "calc(5.5rem + var(--safe-area-top))";
	const BOTTOM_INSET = "9rem";
	// Under this, the gesture was a tap on the swap control, not a drag.
	const DRAG_SLOP = 8;

	let corner = $state<Corner>("bottom-right");
	let tile = $state<HTMLElement | null>(null);
	let offset = $state<{ x: number; y: number } | null>(null);
	let origin: { x: number; y: number; pointer: number } | null = null;
	let dragged = false;

	const placement = $derived({
		top: corner.startsWith("top") ? TOP_INSET : "auto",
		bottom: corner.startsWith("bottom") ? BOTTOM_INSET : "auto",
		left: corner.endsWith("left") ? SIDE_INSET : "auto",
		right: corner.endsWith("right") ? SIDE_INSET : "auto",
	});

	function startDrag(event: PointerEvent): void {
		if (event.pointerType === "mouse" && event.button !== 0) return;
		origin = {
			x: event.clientX,
			y: event.clientY,
			pointer: event.pointerId,
		};
		dragged = false;
		tile?.setPointerCapture(event.pointerId);
	}

	function moveDrag(event: PointerEvent): void {
		if (!origin || event.pointerId !== origin.pointer) return;
		const x = event.clientX - origin.x;
		const y = event.clientY - origin.y;
		if (!dragged && Math.hypot(x, y) < DRAG_SLOP) return;
		dragged = true;
		offset = { x, y };
	}

	function endDrag(event: PointerEvent): void {
		if (!origin || event.pointerId !== origin.pointer) return;
		origin = null;
		// Read where it was let go of before the offset is dropped: the
		// element only moves back on the next render.
		const box = dragged ? tile?.getBoundingClientRect() : undefined;
		offset = null;
		if (!box) return;
		const vertical =
			box.top + box.height / 2 < window.innerHeight / 2
				? "top"
				: "bottom";
		const horizontal =
			box.left + box.width / 2 < window.innerWidth / 2 ? "left" : "right";
		corner = `${vertical}-${horizontal}`;
	}

	// A call that ends mid-drag never delivers the pointerup, so the drag is
	// dropped with the tile rather than left to reopen on the next call.
	function trackTile(element: HTMLElement) {
		tile = element;
		return () => {
			tile = null;
			origin = null;
			offset = null;
			dragged = false;
		};
	}

	// The click that closes a drag would otherwise also swap the tiles. Only
	// that one: a tap right after is a tap.
	function swallowClick(event: MouseEvent): void {
		if (!dragged) return;
		dragged = false;
		event.preventDefault();
		event.stopPropagation();
	}
</script>

<!-- One control: a round button with its job written under it, so the row
     reads as labels rather than as a line of glyphs to be guessed at. -->
{#snippet control({
	label,
	icon,
	onclick,
	disabled = false,
	tone = "neutral",
}: {
	label: string;
	icon: Snippet;
	onclick: () => void;
	disabled?: boolean;
	tone?: "neutral" | "decline" | "accept";
})}
	<button
		type="button"
		aria-label={label}
		{disabled}
		{onclick}
		class="flex w-18 flex-col items-center gap-1.5 text-center disabled:opacity-35"
	>
		<span
			class={[
				"flex size-14 items-center justify-center rounded-full text-white shadow-lg transition",
				{
					"border border-white/15 bg-white/10 scrim backdrop-filter-(--bd-rail)":
						tone === "neutral",
					"bg-destructive": tone === "decline",
					"bg-online": tone === "accept",
					"active:scale-90": !disabled,
				},
			]}
		>
			{@render icon()}
		</span>
		<span class="text-caption leading-none text-white/80">{label}</span>
	</button>
{/snippet}

{#snippet micIcon()}
	{#if videoCall.micMuted}
		<MicrophoneSlashIcon size={24} />
	{:else}
		<MicrophoneIcon size={24} />
	{/if}
{/snippet}

{#snippet cameraIcon()}
	{#if videoCall.cameraOff}
		<VideoCameraSlashIcon size={24} />
	{:else}
		<VideoCameraIcon size={24} />
	{/if}
{/snippet}

{#snippet flipIcon()}
	<CameraRotateIcon size={24} />
{/snippet}

{#snippet hangUpIcon()}
	<PhoneSlashIcon size={26} />
{/snippet}

{#snippet answerIcon()}
	<VideoCameraIcon size={26} weight="fill" />
{/snippet}

{#if videoCall.phase !== "idle"}
	<!-- Above every sheet and dialog in the app: a call is the one thing that
	     may not end up behind something else. -->
	<div class="fixed inset-0 z-100 flex flex-col bg-black text-white">
		{#if active}
			<!-- Their picture fills the screen; ours is the small tile. -->
			<div
				class="absolute inset-0 overflow-hidden bg-neutral-900"
				{@attach (element) => {
					videoCall.setRemoteTile(element);
					return () => videoCall.setRemoteTile(null);
				}}
			></div>
			{#if videoCall.remoteCameraOff}
				<!-- A muted camera leaves their last frame frozen on screen, so
				     their face covers it rather than a still of them. -->
				<div class="absolute inset-0">
					<UserAvatar
						mediaHash={videoCall.party?.mediaHash ?? null}
						class="size-full"
						size="xl"
					/>
				</div>
			{/if}

			<div
				class="relative z-20 px-4 pt-fixed-header"
				style:text-shadow="0 1px 4px rgb(0 0 0 / 0.7)"
			>
				<div class="text-title font-bold">{name}</div>
				<div class="text-body text-white/70 tabular-nums">
					{formatCallDuration(videoCall.elapsedSeconds)}
				</div>
			</div>
		{:else}
			<div
				class="relative z-20 flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
			>
				<div class="relative size-28">
					<span
						class="absolute inset-0 animate-ping rounded-full bg-primary/25"
					></span>
					<UserAvatar
						mediaHash={videoCall.party?.mediaHash ?? null}
						class="relative size-28 overflow-hidden rounded-full border-2 border-primary/40"
						size="lg"
					/>
				</div>
				<div class="text-title font-bold">{name}</div>
				<div class="text-body text-white/70">
					{incoming ? "Incoming video call" : "Calling…"}
				</div>
			</div>
		{/if}

		<!-- Our own tile sits above the controls in every phase, ringing
		     included: a call is answered having already seen what is going out,
		     and on the camera picked for it. It is dragged to any corner. -->
		<div
			{@attach trackTile}
			role="group"
			aria-label="Your video — drag to another corner"
			class={[
				"absolute z-20 h-40 w-28 touch-none overflow-hidden rounded-xl border border-white/15 bg-neutral-900 shadow-lg",
				{ "cursor-grabbing": offset, "cursor-grab": !offset },
			]}
			style:top={placement.top}
			style:bottom={placement.bottom}
			style:left={placement.left}
			style:right={placement.right}
			style:translate={offset ? `${offset.x}px ${offset.y}px` : undefined}
			onpointerdown={startDrag}
			onpointermove={moveDrag}
			onpointerup={endDrag}
			onpointercancel={endDrag}
			onclickcapture={swallowClick}
		>
			<div
				class="size-full"
				{@attach (element) => {
					videoCall.setLocalTile(element);
					return () => videoCall.setLocalTile(null);
				}}
			></div>
			{#if videoCall.cameraOff}
				<div
					class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 border border-dashed border-white/20 bg-neutral-900"
				>
					<VideoCameraSlashIcon size={22} class="text-white/40" />
					<span class="text-caption text-white/50">Camera off</span>
				</div>
			{:else if !videoCall.cameraReady}
				<!-- Not off, just not open yet — our face stands in rather than
				     a black rectangle. -->
				<UserAvatar
					mediaHash={videoCall.ownMediaHash}
					class="absolute inset-0 size-full"
					size="xl"
				/>
			{/if}
			{#if !videoCall.cameraOff}
				<span
					class="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent px-2 pt-4 pb-1.5 text-center text-caption leading-none text-white/85"
				>
					You · {facingLabel}
				</span>
			{/if}
			{#if active}
				<!-- Its own control rather than a handler on the tile: the tile
				     is where the video plays. -->
				<button
					type="button"
					aria-label="Swap the video tiles"
					class="absolute inset-0 touch-none"
					onclick={() => videoCall.swapTiles()}
				></button>
			{/if}
		</div>

		<div
			class="relative z-20 mt-auto flex items-start justify-center gap-2 px-4 pb-8 pb-fixed-nav"
		>
			{#if active}
				{@render control({
					label: videoCall.micMuted ? "Unmute" : "Mute",
					icon: micIcon,
					onclick: () => videoCall.toggleMic(),
				})}
			{:else}
				{@render control({
					label: "Camera",
					icon: cameraIcon,
					onclick: () => videoCall.toggleCamera(),
				})}
			{/if}
			{@render control({
				label: "Flip",
				icon: flipIcon,
				disabled: !videoCall.canFlip,
				onclick: () => void videoCall.switchCamera(),
			})}
			{#if active}
				{@render control({
					label: "Camera",
					icon: cameraIcon,
					onclick: () => videoCall.toggleCamera(),
				})}
			{/if}
			{@render control({
				label: active ? "End" : incoming ? "Decline" : "Cancel",
				icon: hangUpIcon,
				tone: "decline",
				onclick: () => void videoCall.hangUp(),
			})}
			{#if incoming}
				{@render control({
					label: "Accept",
					icon: answerIcon,
					tone: "accept",
					onclick: () => void videoCall.accept(),
				})}
			{/if}
		</div>
	</div>
{/if}
