<script lang="ts">
	let { children }: { children: import("svelte").Snippet } = $props();
</script>

<!-- Explanatory note for the group above it. Sits outside the card, as native
     grouped lists do, so the card stays a clean list of rows. -->
<p class="mt-1.5 px-4 text-caption leading-snug text-muted-foreground">
	{@render children()}
</p>
