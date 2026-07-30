<script lang="ts">
	let { children }: { children: import("svelte").Snippet } = $props();
</script>

<!-- Group label for a settings section. Deliberately label-scale rather than
     heading-scale so it doesn't compete with the nav bar title, matching how
     native grouped settings lists label their groups. -->
<h2
	class="mt-5 mb-1.5 truncate px-4 text-caption font-semibold tracking-wide text-muted-foreground uppercase first:mt-0"
>
	{@render children()}
</h2>
