<script lang="ts">
	import { PauseIcon, PlayIcon, TrashIcon } from "phosphor-svelte";
	import { fade } from "svelte/transition";

	import { measurePeaks } from "$lib/chat/audio-peaks";
	import {
		formatSpeed,
		nextSpeed,
		type PlaybackSpeed,
	} from "$lib/chat/audio-speed";
	import AudioWaveform from "$lib/components/audio/AudioWaveform.svelte";
	import { formatMediaDuration } from "$lib/util/format-time";
	import ComposerButton from "../ComposerButton.svelte";
	import { getMessageComposerContext } from "../message-composer-context.svelte";

	const { voice } = $derived(getMessageComposerContext()());

	let audio = $state<HTMLAudioElement | null>(null);
	let paused = $state(true);
	let currentTime = $state(0);
	let elementDuration = $state(0);
	let speed = $state<PlaybackSpeed>(1);
	let peaks = $state<number[] | null>(null);

	// The take is already in hand, so its shape costs nothing but the decode.
	$effect(() => {
		const bytes = voice.pendingBytes;
		peaks = null;
		if (bytes === null) return;
		let current = true;
		void measurePeaks(bytes).then((measured) => {
			if (current) peaks = measured;
		});
		return () => {
			current = false;
		};
	});

	$effect(() => {
		if (audio !== null) audio.playbackRate = speed;
	});

	// A recording the webview has not finished containerising reports no duration
	// of its own, so the recorder's measured length carries the row until it does.
	const duration = $derived(
		elementDuration > 0 ? elementDuration : voice.pendingDurationMs / 1000,
	);
	const played = $derived(
		duration > 0 ? Math.min(currentTime / duration, 1) : 0,
	);
	const readout = $derived(
		currentTime > 0 || !paused ? currentTime : duration,
	);

	function toggle() {
		if (audio === null) return;
		if (paused) {
			audio.playbackRate = speed;
			void audio.play();
		} else audio.pause();
	}
</script>

<!-- Laid over the composer the same way the recording row is, so the field
     underneath keeps the row's height. -->
<div
	class="absolute inset-y-0 start-0 end-12 z-10 flex items-center gap-2 bg-background"
	transition:fade={{ duration: 150 }}
>
	<ComposerButton
		aria-label="Discard recording"
		disabled={voice.sending}
		onclick={() => voice.discardPending()}
	>
		{#snippet icon({ ...props })}
			<TrashIcon {...props} />
		{/snippet}
	</ComposerButton>

	<div class="flex h-10 min-w-0 grow items-center gap-2.5 px-1">
		<audio
			bind:this={audio}
			bind:paused
			bind:currentTime
			bind:duration={elementDuration}
			src={voice.pendingUrl ?? ""}
			preload="metadata"
		></audio>
		<button
			type="button"
			class="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
			aria-label={paused ? "Play recording" : "Pause recording"}
			disabled={voice.sending}
			onclick={toggle}
		>
			{#if paused}
				<PlayIcon weight="fill" class="size-3.5 translate-x-px" />
			{:else}
				<PauseIcon weight="fill" class="size-3.5" />
			{/if}
		</button>
		<AudioWaveform
			{peaks}
			progress={played}
			class="h-6 min-w-0 grow text-primary"
		/>
		<button
			type="button"
			class="shrink-0 cursor-pointer rounded-full bg-muted px-1.5 text-row leading-tight font-semibold tabular-nums disabled:opacity-50"
			aria-label="Change playback speed"
			disabled={voice.sending}
			onclick={() => (speed = nextSpeed(speed))}
		>
			{formatSpeed(speed)}
		</button>
		<span class="shrink-0 text-row tabular-nums">
			{formatMediaDuration(readout)}
		</span>
		{#if voice.sending}
			<span class="shrink-0 text-preview text-muted-foreground">
				Sending…
			</span>
		{/if}
	</div>
</div>
