<script lang="ts">
	import { goto } from "$app/navigation";
	import XIcon from "phosphor-svelte/lib/XIcon";

	// The profile is always reached as a push (feed tile, chat header, command
	// center), so closing it is a back navigation. Opened from a deep link there
	// is nothing to go back to, and the feed is the sensible landing.
	function close() {
		if (window.navigation?.canGoBack ?? history.length > 1) {
			history.back();
		} else {
			goto("/").catch((error) => console.error(error));
		}
	}
</script>

<button
	type="button"
	onclick={close}
	aria-label="Close profile"
	class="absolute top-3.5 left-3.5 z-10 flex size-8.5 items-center justify-center rounded-full bg-plate-strong text-plate-foreground backdrop-blur-md after:absolute after:-inset-1.25 after:content-['']"
>
	<XIcon class="size-4" weight="bold" />
</button>
