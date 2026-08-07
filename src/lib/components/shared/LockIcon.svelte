<script lang="ts">
	// The redesign's lock (see the locked-album row in the handoff's profile
	// screens): a stroked body and shackle, no keyhole, so it sits with the rest
	// of the line iconography instead of reading as a filled badge.
	let {
		class: className,
		...rest
	}: {
		class?: import("svelte/elements").ClassValue;
	} & import("svelte/elements").SVGAttributes<SVGSVGElement> = $props();
</script>

<svg
	viewBox="0 0 18 18"
	fill="none"
	stroke="currentColor"
	stroke-width="1.6"
	class={["size-4 shrink-0", className]}
	{...rest}
>
	<rect x="3.4" y="7.6" width="11.2" height="7.6" rx="2" />
	<path d="M6 7.6V5.4a3 3 0 0 1 6 0v2.2" />
</svg>
