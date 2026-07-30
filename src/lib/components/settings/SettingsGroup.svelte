<script lang="ts">
	let {
		children,
		divider = "inset",
		class: className,
	}: {
		children: import("svelte").Snippet;
		/**
		 * Where the hairline between rows starts. `inset` aligns it with the text
		 * column of rows that carry an icon tile; `full` spans the whole card and
		 * suits groups whose rows have no tile.
		 */
		divider?: "inset" | "full" | "none";
		class?: string;
	} = $props();
</script>

<!-- A grouped settings card: rows are fused into one surface with hairlines
     between them, so radius only ever lands on the group's outer corners.
     Replaces the previous one-card-per-row layout. -->
<div
	class={["settings-group", className]}
	style={divider === "inset" ? "--divider-inset: 3.875rem" : undefined}
	data-divider={divider}
>
	{@render children()}
</div>

<style lang="postcss">
	@reference "$layout";

	.settings-group {
		@apply overflow-hidden rounded-xl border border-border bg-card;
	}

	/* Hairlines are drawn by the rows themselves rather than `divide-y` so the
	   inset can follow the icon column, and so a row's press highlight paints
	   underneath the line instead of clipping it. */
	.settings-group[data-divider="none"] > :global(* + *)::before {
		content: none;
	}

	.settings-group > :global(* + *) {
		position: relative;
	}

	.settings-group > :global(* + *)::before {
		content: "";
		position: absolute;
		top: 0;
		inset-inline-start: var(--divider-inset, 0);
		inset-inline-end: 0;
		height: 1px;
		background-color: var(--border);
		pointer-events: none;
	}
</style>
