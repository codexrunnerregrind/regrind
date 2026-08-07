<script lang="ts">
	import { version } from "$app/environment";

	import { toggleDemoMode } from "$lib/demo/config";

	// Hidden developer gesture: seven taps on the version string flip demo mode.
	// Same shape as the usual "tap the build number" easter egg — the count
	// resets if you stop tapping. No feedback while counting: toasts land at the
	// bottom of the screen, right where the version string is, so a hint would
	// cover the very thing you have to keep tapping. The confirmation comes as a
	// toast after the reload instead.
	const TAPS_TO_TOGGLE = 7;
	const RESET_AFTER_MS = 1500;

	let taps = 0;
	let reset: ReturnType<typeof setTimeout> | undefined;

	function tap(): void {
		clearTimeout(reset);
		taps += 1;

		if (taps >= TAPS_TO_TOGGLE) {
			taps = 0;
			toggleDemoMode();
			return;
		}

		reset = setTimeout(() => (taps = 0), RESET_AFTER_MS);
	}
</script>

<button
	type="button"
	onclick={tap}
	class="mt-6 px-4 text-center font-mono text-2xs break-all whitespace-pre-wrap text-muted-foreground select-text"
>
	{version}
</button>
