<script lang="ts">
	// Phosphor has no user-with-prohibit glyph; this is the mock's own. The
	// viewBox nudges it right: centred by its box, the person reads as left.
	let {
		class: className,
		...rest
	}: {
		class?: import("svelte/elements").ClassValue;
	} & import("svelte/elements").SVGAttributes<SVGSVGElement> = $props();
</script>

<svg
	viewBox="-0.6 0.65 20 20"
	fill="none"
	stroke="currentColor"
	stroke-width="0.75"
	stroke-linecap="round"
	stroke-linejoin="round"
	class={["size-6 shrink-0", className]}
	{...rest}
>
	<circle cx="8" cy="6.6" r="3.1" />
	<path d="M2.6 17c0-3.2 2.4-5.6 5.4-5.6 1 0 1.9.2 2.6.7" />
	<circle cx="14.6" cy="14.6" r="3.2" />
	<path d="m12.4 16.8 4.4-4.4" />
</svg>
