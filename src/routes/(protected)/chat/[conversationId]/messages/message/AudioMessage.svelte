<script module lang="ts">
	// Voice notes never overlap: starting one stops whichever was already
	// playing, the way every chat client behaves.
	let stopPlaying: (() => void) | null = null;

	function claimPlayback(stop: () => void): void {
		if (stopPlaying !== null && stopPlaying !== stop) stopPlaying();
		stopPlaying = stop;
	}

	function releasePlayback(stop: () => void): void {
		if (stopPlaying === stop) stopPlaying = null;
	}
</script>

<script lang="ts">
	import { PauseIcon, PlayIcon } from "phosphor-svelte";
	import { tick } from "svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import { getSingleMessage } from "$lib/api/messaging/messages";
	import { formatMediaDuration } from "$lib/util/format-time";
	import type { AudioMessage } from "$lib/model/messaging/messages";
	import { MessageMediaState } from "./message-media.svelte";

	const SKIP_SECONDS = 5;
	// Signatures are minted with about 15 minutes on them; anything this close to
	// the deadline is refreshed rather than risked mid-tap.
	const EXPIRY_MARGIN_MS = 5_000;

	let {
		message,
		conversationId,
		messageId,
	}: {
		message: AudioMessage["body"];
		conversationId: string;
		messageId: string;
	} = $props();

	const media = new MessageMediaState();

	let audio = $state<HTMLAudioElement | null>(null);
	let paused = $state(true);
	let currentTime = $state(0);
	let elementDuration = $state(0);
	let loading = $state(false);
	let scrubbing = $state(false);
	let retried = false;
	let track = $state<HTMLDivElement | null>(null);
	let thumb = $state<HTMLDivElement | null>(null);

	// The URL the message arrived with outlives its signature, so a bubble that
	// has been sitting in a conversation for a while fetches a fresh one before
	// it plays.
	let refreshed = $state<{ url: string; expiresAt: number | null } | null>(
		null,
	);
	const url = $derived(refreshed?.url ?? message.url);
	const expiresAt = $derived(
		refreshed === null ? message.expiresAt : refreshed.expiresAt,
	);

	// `length` is milliseconds and often absent — the element's own duration is
	// the truth, but only once the metadata has landed, so the reported length
	// carries the bubble until then.
	const duration = $derived(
		elementDuration > 0 ? elementDuration : (message.length ?? 0) / 1000,
	);
	const played = $derived(
		duration > 0 ? Math.min(currentTime / duration, 1) : 0,
	);

	// One number, at the end of the row: the length of the note while it sits
	// idle, the elapsed time once it is playing or has been scrubbed.
	const readout = $derived(
		currentTime > 0 || !paused ? currentTime : duration,
	);

	/** Inset by half a thumb at either end, so the thumb stays on the track. */
	const playhead = $derived(
		`calc(${played} * (100% - var(--thumb-size)) + var(--thumb-size) / 2)`,
	);

	// Held as one stable function so the module-level claim can be handed back
	// on pause, on end, and when the bubble scrolls out of existence.
	const stopSelf = () => {
		audio?.pause();
	};

	$effect(() => () => {
		stopSelf();
		releasePlayback(stopSelf);
	});

	async function refresh(): Promise<boolean> {
		if (loading) return false;
		loading = true;
		try {
			const { message: fresh } = await getSingleMessage({
				conversationId,
				messageId,
			});
			if (fresh.type !== "Audio")
				throw new Error(`Expected an Audio message, got ${fresh.type}`);
			refreshed = {
				url: fresh.body.url,
				expiresAt: fresh.body.expiresAt,
			};
			// The new src has to reach the element before it is asked to play.
			await tick();
			audio?.load();
			return true;
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to load voice message", error });
			return false;
		} finally {
			loading = false;
		}
	}

	async function start(): Promise<void> {
		const el = audio;
		if (el === null) return;
		claimPlayback(stopSelf);
		try {
			await el.play();
			retried = false;
		} catch (error) {
			// An expired signature fails at playback, not at parse: refresh the URL
			// once and try again before bothering the user about it.
			if (!retried) {
				retried = true;
				if (await refresh()) {
					await start();
					return;
				}
			}
			console.error(error);
			showErrorToast({ label: "Failed to play voice message", error });
		}
	}

	async function toggle(): Promise<void> {
		const el = audio;
		if (el === null || loading) return;
		if (!el.paused) {
			stopSelf();
			releasePlayback(stopSelf);
			return;
		}
		if (
			expiresAt !== null &&
			expiresAt <= Date.now() + EXPIRY_MARGIN_MS &&
			!(await refresh())
		)
			return;
		await start();
	}

	function seekTo(time: number) {
		const el = audio;
		if (el === null || duration <= 0) return;
		el.currentTime = Math.min(duration, Math.max(0, time));
	}

	function seekToPointer(event: PointerEvent) {
		if (track === null || duration <= 0) return;
		const { left, width } = track.getBoundingClientRect();
		// The thumb travels between its own two halves, not the full width, so the
		// tap has to be measured against the same span the playhead uses.
		const inset = thumb?.offsetWidth ?? 0;
		const travel = width - inset;
		if (travel <= 0) return;
		seekTo(((event.clientX - left - inset / 2) / travel) * duration);
	}

	function grab(event: PointerEvent) {
		scrubbing = true;
		track?.setPointerCapture(event.pointerId);
		seekToPointer(event);
	}

	function release(event: PointerEvent) {
		scrubbing = false;
		track?.releasePointerCapture(event.pointerId);
	}

	function seekByKey(event: KeyboardEvent) {
		if (event.key === "ArrowLeft") seekTo(currentTime - SKIP_SECONDS);
		else if (event.key === "ArrowRight") seekTo(currentTime + SKIP_SECONDS);
		else if (event.key === "Home") seekTo(0);
		else if (event.key === "End") seekTo(duration);
		else return;
		event.preventDefault();
	}

	// The bubble around us long-presses into the context menu and drags into a
	// reply; a tap on the button or a drag along the track is neither.
	function keepToSelf(event: Event) {
		event.stopPropagation();
	}
</script>

<div
	class={[
		// `relative` is what the reaction pill anchors to: without it the pill
		// escapes to whatever ancestor is positioned and floats off on its own.
		"relative flex items-center gap-2 rounded-bubble px-2.5 py-1.5",
		"w-3/4 max-w-52 min-w-40",
		{
			"bg-message-bubble-in text-message-bubble-foreground": !media.isOut,
			"rounded-es-bubble-tail": media.lastInStack && !media.isOut,
			"bg-message-bubble-out text-message-bubble-out-foreground":
				media.isOut,
			"rounded-ee-bubble-tail": media.lastInStack && media.isOut,
			"size-full": media.clone,
		},
	]}
	{@attach media.attach}
>
	<audio
		bind:this={audio}
		bind:paused
		bind:currentTime
		bind:duration={elementDuration}
		src={url}
		preload="metadata"
		onended={() => {
			// Left at the end, the next tap would replay nothing.
			currentTime = 0;
			releasePlayback(stopSelf);
		}}
	></audio>

	<button
		type="button"
		class={[
			"flex size-8 shrink-0 items-center justify-center rounded-full",
			"bg-current/20 transition-opacity",
			// Tinted from the bubble's own ink, like the track and the quote block:
			// bubble colors are picked per side in settings, so the accent has no
			// relation to whatever surface this button lands on.
			{ "cursor-pointer": !loading, "opacity-50": loading },
		]}
		aria-label={paused ? "Play voice message" : "Pause voice message"}
		disabled={loading}
		onclick={() => void toggle()}
		onpointerdown={keepToSelf}
		onkeydown={keepToSelf}
	>
		{#if paused}
			<PlayIcon size={14} weight="fill" />
		{:else}
			<PauseIcon size={14} weight="fill" />
		{/if}
	</button>

	<div
		bind:this={track}
		role="slider"
		tabindex="0"
		aria-label="Seek voice message"
		aria-valuemin={0}
		aria-valuemax={duration}
		aria-valuenow={currentTime}
		aria-valuetext={formatMediaDuration(currentTime)}
		data-slot="audio-track"
		class="relative flex h-3 min-w-0 grow cursor-pointer touch-none items-center outline-hidden"
		onpointerdown={(event) => {
			keepToSelf(event);
			grab(event);
		}}
		onpointermove={(event) => {
			keepToSelf(event);
			if (scrubbing) seekToPointer(event);
		}}
		onpointerup={release}
		onpointercancel={release}
		onkeydown={(event) => {
			keepToSelf(event);
			seekByKey(event);
		}}
	>
		<div class="h-0.5 w-full rounded-full bg-current/30">
			<div
				data-slot="audio-played"
				class="h-full rounded-full bg-current"
				style:width={playhead}
			></div>
		</div>
		<div
			bind:this={thumb}
			data-slot="audio-thumb"
			class={[
				"pointer-events-none absolute size-(--thumb-size) -translate-x-1/2 rounded-full bg-current transition-transform",
				{ "scale-125": scrubbing },
			]}
			style:left={playhead}
		></div>
	</div>

	<span class="shrink-0 text-meta leading-none tabular-nums">
		{formatMediaDuration(readout)}
	</span>
	{@render media.adornments?.()}
</div>

<style>
	/* One place for the thumb's size: the playhead offsets by half of it at both
	   ends so the thumb never overhangs the track it rides on. */
	[data-slot="audio-track"] {
		--thumb-size: 0.5rem;
	}
</style>
