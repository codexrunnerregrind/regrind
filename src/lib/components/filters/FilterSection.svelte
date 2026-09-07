<script lang="ts">
	let {
		title,
		status,
		children,
	}: {
		title: string;
		/** Right-aligned state for the whole section, e.g. "1 selected". */
		status?: string;
		children?: import("svelte").Snippet;
	} = $props();
</script>

<section class="flex min-w-0 shrink-0 flex-col gap-2">
	<div class="flex items-baseline justify-between gap-2 px-1">
		<h3
			class="text-3xs font-semibold tracking-wider text-muted-foreground uppercase"
		>
			{title}
		</h3>
		{#if status}
			<span class="text-3xs font-medium text-primary">{status}</span>
		{/if}
	</div>
	{@render children?.()}
</section>
