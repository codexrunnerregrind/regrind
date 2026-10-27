<script lang="ts">
	import FireIcon from "phosphor-svelte/lib/FireIcon";

	let {
		kind,
		class: className,
	}: {
		/** Fire for a tap, an eye for a view, arrows for interactions in general. */
		kind: "tap" | "view" | "mutual";
		class?: import("svelte/elements").ClassValue;
	} = $props();
</script>

{#if kind === "tap"}
	<FireIcon
		weight="bold"
		class={["shrink-0", className]}
		aria-hidden="true"
	/>
{:else if kind === "mutual"}
	<svg
		viewBox="0 0 16 16"
		fill="none"
		stroke="currentColor"
		stroke-width="1.6"
		stroke-linecap="round"
		stroke-linejoin="round"
		class={["shrink-0", className]}
		aria-hidden="true"
	>
		<path
			d="M2.5 5.5h10M10 3l2.5 2.5L10 8M13.5 10.5h-10M6 8l-2.5 2.5L6 13"
		/>
	</svg>
{:else}
	<svg
		viewBox="0 0 14 14"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		class={["shrink-0", className]}
		aria-hidden="true"
	>
		<path d="M1 7s2.2-3.6 6-3.6S13 7 13 7s-2.2 3.6-6 3.6S1 7 1 7z" />
		<circle cx="7" cy="7" r="1.5" />
	</svg>
{/if}
