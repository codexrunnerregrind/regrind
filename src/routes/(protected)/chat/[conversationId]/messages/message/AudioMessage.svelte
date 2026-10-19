<script module lang="ts">
	import type { PlaybackSpeed } from "$lib/chat/audio-speed";

	// Voice notes never overlap: starting one stops whichever was already
	// playing, the way every chat client behaves.
	let stopPlaying: (() => void) | null = null;

	/**
	 * The rate belongs to the listening rather than to one note: picking 1.5x on
	 * a note and then playing another keeps it, which is what WhatsApp does and
	 * what makes the setting worth having on a run of voice notes.
	 */
	let playbackSpeed = $state<PlaybackSpeed>(1);

	/**
	 * Every voice note on screen, so one that reaches its end can hand over to
	 * the note that follows it.
	 */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a plain lookup: nothing renders from it, and reading it reactively would tie every bubble to every other one
	const players = new Map<string, () => void>();

	function claimPlayback(stop: () => void): void {
		if (stopPlaying !== null && stopPlaying !== stop) stopPlaying();
		stopPlaying = stop;
	}

	function releasePlayback(stop: () => void): void {
		if (stopPlaying === stop) stopPlaying = null;
	}
</script>

<script lang="ts">
	import PauseIcon from "phosphor-svelte/lib/PauseIcon";
	import PlayIcon from "phosphor-svelte/lib/PlayIcon";
	import { tick } from "svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import { getSingleMessage } from "$lib/api/messaging/messages";
	import { peaksFor } from "$lib/chat/audio-peaks";
	import { formatSpeed, nextSpeed } from "$lib/chat/audio-speed";
	import AudioWaveform from "$lib/components/audio/AudioWaveform.svelte";
	import { formatMediaDuration } from "$lib/util/format-time";
	import { observeIntersection } from "$lib/util/observe-intersection";
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
		nextAudioMessageId,
	}: {
		message: AudioMessage["body"];
		conversationId: string;
		messageId: string;
		// The message right after this one, when that message is a voice note
		// too. Reaching the end hands over to it, so a run of them plays through.
		nextAudioMessageId?: string;
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
	let peaks = $state<number[] | null>(null);
	let onScreen = $state(false);

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

	// The bars are drawn from the clip itself, which means fetching it a second
	// time — so it waits until the bubble has been scrolled to rather than
	// pulling every voice note in the history the moment the chat opens. A clip
	// that cannot be read leaves the row as a plain line.
	$effect(() => {
		if (!onScreen) return;
		const wanted = { key: String(message.mediaId), url };
		let current = true;
		void peaksFor(wanted).then((measured) => {
			if (current) peaks = measured;
		});
		return () => {
			current = false;
		};
	});

	// A reload — a refreshed signature, say — puts the element back at 1x.
	$effect(() => {
		if (audio !== null) audio.playbackRate = playbackSpeed;
	});

	// Registered by id rather than by position: the note that ends looks its
	// successor up here, and a successor that is not on screen simply is not
	// found, which ends the run rather than breaking it.
	$effect(() => {
		const handover = () => void play();
		players.set(messageId, handover);
		return () => {
			if (players.get(messageId) === handover) players.delete(messageId);
		};
	});

	// One number, at the end of the row: the length of the note while it sits
	// idle, the elapsed time once it is playing or has been scrubbed.
	const readout = $derived(
		currentTime > 0 || !paused ? currentTime : duration,
	);

	// The speed button rides with the pause button: it belongs to the note being
	// listened to, and every other bubble stays quiet. A note left part-way
	// through counts as idle — it keeps its position, not the controls.
	const playing = $derived(!paused);

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
			el.playbackRate = playbackSpeed;
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

	/** Refreshes a url about to expire, then plays. Also what a handover calls. */
	async function play(): Promise<void> {
		if (audio === null || loading) return;
		if (
			expiresAt !== null &&
			expiresAt <= Date.now() + EXPIRY_MARGIN_MS &&
			!(await refresh())
		)
			return;
		await start();
	}

	async function toggle(): Promise<void> {
		const el = audio;
		if (el === null || loading) return;
		if (!el.paused) {
			stopSelf();
			releasePlayback(stopSelf);
			return;
		}
		await play();
	}

	function seekTo(time: number) {
		const el = audio;
		if (el === null || duration <= 0) return;
		el.currentTime = Math.min(duration, Math.max(0, time));
	}

	function seekToPointer(event: PointerEvent) {
		if (track === null || duration <= 0) return;
		const { left, width } = track.getBoundingClientRect();
		if (width <= 0) return;
		seekTo(((event.clientX - left) / width) * duration);
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
		"relative flex items-center gap-2 rounded-bubble px-2.5 py-2",
		"w-3/4 max-w-56 min-w-44",
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
	use:observeIntersection={{ handle: () => (onScreen = true), once: true }}
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
			// Only ever the very next message: a text in between is the end of
			// the run, not something to play past.
			if (nextAudioMessageId !== undefined) {
				players.get(nextAudioMessageId)?.();
			}
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
		class="relative flex h-9 min-w-0 grow cursor-pointer touch-none items-center outline-hidden"
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
		<AudioWaveform {peaks} progress={played} class="h-full w-full" />
	</div>

	<!-- The column keeps its width whether or not the speed button is in it, so
	     starting a note does not shorten the waveform under the finger. -->
	<div class="flex w-10 shrink-0 flex-col items-center gap-1">
		{#if playing}
			<button
				type="button"
				class="cursor-pointer rounded-full bg-current/20 px-1.5 text-meta leading-tight font-semibold tabular-nums"
				aria-label="Change playback speed"
				onclick={() => (playbackSpeed = nextSpeed(playbackSpeed))}
				onpointerdown={keepToSelf}
				onkeydown={keepToSelf}
			>
				{formatSpeed(playbackSpeed)}
			</button>
		{/if}
		<span class="text-meta leading-none tabular-nums">
			{formatMediaDuration(readout)}
		</span>
	</div>
	{@render media.adornments?.()}
</div>
