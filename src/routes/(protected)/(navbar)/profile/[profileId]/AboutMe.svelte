<script lang="ts">
	import * as Card from "$lib/components/ui/card";

	let { children }: { children?: import("svelte").Snippet } = $props();
</script>

<Card.Root class="mt-4 rounded-xl">
	<!-- `text-wrap: pretty` keeps a lone word off the last line of a bio. -->
	<Card.Content
		class="text-pretty wrap-break-word whitespace-pre-wrap select-text"
	>
		{@render children?.()}
	</Card.Content>
</Card.Root>
