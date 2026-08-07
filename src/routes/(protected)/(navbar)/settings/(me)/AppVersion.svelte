<script lang="ts">
	import { version } from "$app/environment";
	import { toast } from "svelte-sonner";

	import { demoEnabled, toggleDemoMode } from "$lib/demo/config";

	// Hidden developer gesture: seven taps on the version string flip demo mode.
	// Same shape as the usual "tap the build number" easter egg — the count
	// resets if you stop tapping, and we only start hinting near the end so the
	// gesture stays out of the way of someone reading or copying the version.
	const TAPS_TO_TOGGLE = 7;
	const HINT_FROM_TAP = 4;
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

		if (taps >= HINT_FROM_TAP) {
			const left = TAPS_TO_TOGGLE - taps;
			toast(
				`${left} more ${left === 1 ? "tap" : "taps"} to ${
					demoEnabled ? "leave" : "enter"
				} demo mode`,
			);
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
