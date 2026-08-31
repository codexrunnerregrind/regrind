<script lang="ts">
	import { TrashIcon } from "phosphor-svelte";
	import { fade } from "svelte/transition";

	import { formatMediaDuration } from "$lib/util/format-time";
	import ComposerButton from "../ComposerButton.svelte";
	import { getMessageComposerContext } from "../message-composer-context.svelte";

	const { voice } = $derived(getMessageComposerContext()());

	let bin: HTMLElement | null = $state(null);
	$effect(() => {
		voice.setCancelZone(bin);
		return () => voice.setCancelZone(null);
	});
</script>

<!-- Laid over the composer rather than replacing it: the row keeps the height
     the text field gave it, and fading out here reveals the field underneath
     instead of stacking two rows on top of each other while the fade runs. The
     mic keeps its own slot at the end, under the finger that is holding it. -->
<div
	class="absolute inset-y-0 start-0 end-12 z-10 flex items-center gap-2 bg-background"
	transition:fade={{ duration: 150 }}
>
	<!-- The bin answers the drag from its first millimetre: it swells as the
	     finger comes towards it and goes red once releasing would cancel, so the
	     threshold is something you can see rather than guess at. `transition:
	     none` for the same reason as the mic's — see ComposerVoiceMessageTrigger. -->
	<div bind:this={bin}>
		<ComposerButton
			aria-label="Discard recording"
			class={[
				{
					"bg-destructive text-white hover:bg-destructive":
						voice.cancelArmed,
				},
			]}
			style={`transition: none; transform: scale(${(1 + voice.dragProgress * 0.4).toFixed(2)})`}
			disabled={voice.sending}
			onclick={() => voice.discard()}
		>
			{#snippet icon({ ...props })}
				<TrashIcon {...props} />
			{/snippet}
		</ComposerButton>
	</div>

	<div
		class="flex h-10 min-w-0 grow items-center gap-2.5 px-1"
		style:opacity={(1 - voice.dragProgress * 0.7).toFixed(2)}
		style:transform={`translateX(${-Math.round(voice.dragPx * 0.25)}px)`}
	>
		<!-- Still once the microphone is shut: a dot that kept pulsing through the
		     upload would say the recording was still running. -->
		<span
			class={[
				"size-2 shrink-0 rounded-full bg-destructive",
				{ "animate-pulse": voice.recording },
			]}
		></span>
		<span class="shrink-0 text-row tabular-nums">
			{formatMediaDuration(voice.elapsedMs / 1000)}
		</span>
		<span
			class={[
				"min-w-0 truncate text-preview",
				{
					"text-destructive": voice.cancelArmed,
					"text-muted-foreground": !voice.cancelArmed,
				},
			]}
		>
			{#if voice.sending}
				Sending…
			{:else if voice.cancelArmed}
				Release to cancel
			{:else if voice.locked}
				Tap to stop
			{:else}
				‹ Slide to cancel
			{/if}
		</span>
	</div>
</div>
