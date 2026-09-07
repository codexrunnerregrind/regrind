<script lang="ts">
	let { children }: { children?: import("svelte").Snippet } = $props();
</script>

<!-- The list rows read as one plate, hairlines apart, rather than as loose
     controls stacked on the sheet. -->
<div
	class="flex min-w-0 shrink-0 flex-col divide-y divide-border/60 overflow-hidden rounded-xl bg-muted/40"
>
	{@render children?.()}
</div>
