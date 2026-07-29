<script lang="ts">
	let {
		label,
		children,
	}: {
		label: string;
		children?: import("svelte").Snippet;
	} = $props();
</script>

<div class="gap-1">
	<span class="font-light text-muted-foreground">{label}</span>
	{@render children?.()}
</div>
