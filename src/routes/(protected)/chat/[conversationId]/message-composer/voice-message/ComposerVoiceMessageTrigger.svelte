<script lang="ts">
	import MicrophoneIcon from "phosphor-svelte/lib/MicrophoneIcon";

	import { getMessageComposerContext } from "../message-composer-context.svelte";
	import PrimaryComposerButton from "../PrimaryComposerButton.svelte";

	const { disabled, voice } = $derived(getMessageComposerContext()());

	// The mic gives way to the finger rather than keeping up with it: at 1:1 it
	// sits under the fingertip, where it is both hidden and impossible to judge
	// the drag against. (This is not what caused the shake — see the style
	// attribute below for that.)
	const FOLLOW = 0.3;

	// The drag is followed on the window, not on the button. A button that has
	// moved is no longer under the finger, and pointer capture is not something
	// every webview honours — either way the events would stop arriving here
	// halfway through the gesture.
	function onMove(event: PointerEvent) {
		// Without this the webview is free to read the drag as a scroll, which
		// moves the composer itself under the finger — a shake no amount of
		// smoothing in here could fix.
		if (event.cancelable) event.preventDefault();
		voice.trackPointer(event);
	}

	function onUp() {
		stopTracking();
		void voice.release();
	}

	function onCancel() {
		stopTracking();
		voice.discard();
	}

	function hold(event: PointerEvent) {
		if (disabled || voice.active) return;
		voice.beginDrag(event);
		window.addEventListener("pointermove", onMove, { passive: false });
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", onCancel);
		void voice.start();
	}

	function stopTracking() {
		window.removeEventListener("pointermove", onMove);
		window.removeEventListener("pointerup", onUp);
		window.removeEventListener("pointercancel", onCancel);
	}

	// A conversation closed mid-hold must not leave listeners on the window.
	$effect(() => stopTracking);
</script>

<PrimaryComposerButton
	aria-label="Record voice message"
	class={[
		// The mic is a drag handle for the length of a recording, so the webview
		// must not claim the gesture for panning.
		"touch-none select-none",
		{ "bg-destructive text-white hover:bg-destructive": voice.cancelArmed },
	]}
	style={voice.recording
		? // `transition: none` is the whole point of this being inline. Every
			// button in the app carries `transition-all` from its base styles, so
			// each transform written here was being animated towards, and the next
			// pointer frame restarted the animation from wherever it had reached —
			// the mic never arrived anywhere, which is what read as a shake. A class
			// cannot reliably win against another utility of equal specificity;
			// an inline declaration can.
			`transition: none; transform: translateX(${-Math.round(voice.dragPx * FOLLOW)}px) scale(1.1)`
		: undefined}
	onpointerdown={hold}
	oncontextmenu={(event) => event.preventDefault()}
	{disabled}
>
	{#snippet icon({ ...props })}
		<MicrophoneIcon weight="fill" {...props} />
	{/snippet}
</PrimaryComposerButton>
