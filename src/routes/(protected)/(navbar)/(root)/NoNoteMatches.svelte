<script lang="ts">
	import MagnifyingGlassIcon from "phosphor-svelte/lib/MagnifyingGlassIcon";

	import * as Empty from "$lib/components/ui/empty";

	let { query }: { query: string } = $props();
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<MagnifyingGlassIcon weight="bold" />
		</Empty.Media>
		<Empty.Title>No Matches</Empty.Title>
		<Empty.Description>
			No favorite's note or name matches “{query.trim()}”.
		</Empty.Description>
	</Empty.Header>
</Empty.Root>
