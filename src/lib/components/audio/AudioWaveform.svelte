<script lang="ts">
	let {
		peaks,
		progress,
		class: className,
	}: {
		// One height per bar, 0 to 1. Null until the clip has been read — and for
		// good if it could not be, which draws the plain line instead of pretending
		// to know a shape.
		peaks: number[] | null;
		// How much of the clip has played, 0 to 1.
		progress: number;
		class?: string;
	} = $props();

	// Both layers draw the same bars; the played one is revealed left to right.
	const clip = $derived(
		`inset(0 ${(100 - Math.min(Math.max(progress, 0), 1) * 100).toFixed(2)}% 0 0)`,
	);
</script>

<div class={["relative flex items-center", className]}>
	{#if peaks === null}
		<div class="h-0.5 w-full rounded-full bg-current/30"></div>
		<div
			class="absolute h-0.5 rounded-full bg-current"
			style:width={`${(Math.min(Math.max(progress, 0), 1) * 100).toFixed(2)}%`}
		></div>
	{:else}
		{#snippet bars(opacity: string)}
			<div class={["flex h-full w-full items-center gap-px", opacity]}>
				{#each peaks as height, bar (bar)}
					<div
						class="min-w-px flex-1 rounded-full bg-current"
						style:height={`${Math.round(height * 100)}%`}
					></div>
				{/each}
			</div>
		{/snippet}
		{@render bars("opacity-30")}
		<div class="absolute inset-0 flex items-center" style:clip-path={clip}>
			{@render bars("")}
		</div>
	{/if}
</div>
