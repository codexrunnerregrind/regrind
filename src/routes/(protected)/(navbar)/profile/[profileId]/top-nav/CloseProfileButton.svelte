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

<!-- No plate behind the glyph: like the tile distance label, it leans on a drop
     shadow rather than a fill, so it stays legible over a bright photo without
     putting a disc on top of the face. -->
<button
	type="button"
	onclick={close}
	aria-label="Close profile"
	class="glyph pointer-events-auto absolute top-2 left-2 z-10 flex size-11 items-center justify-center text-plate-foreground"
>
	<!-- `light` is ~1.5px of stroke at 24pt, which is the handoff's 1.6pt line
	     icons; `thin` disappears against a busy photo and `regular` reads heavy
	     without a plate under it. -->
	<XIcon class="size-6" weight="light" />
</button>

<style lang="postcss">
	.glyph :global(svg) {
		filter: drop-shadow(0 1px 3px rgb(0 0 0 / 0.6));
	}
</style>
