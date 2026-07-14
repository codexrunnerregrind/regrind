<script lang="ts">
	import DropIcon from "phosphor-svelte/lib/DropIcon";
	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import { rightNowState } from "$lib/right-now/right-now-state.svelte";
</script>

<Empty.Root class="col-span-full">
	<Empty.Header>
		<Empty.Media variant="icon">
			<DropIcon />
		</Empty.Media>
		<Empty.Title>No posts found</Empty.Title>
		<Empty.Description>
			Try adjusting your filters or reset them to defaults.
		</Empty.Description>
	</Empty.Header>
	<Empty.Content>
		<div class="flex gap-2">
			<Button
				variant="outline"
				onclick={() => rightNowState.filters.resetFilters()}
			>
				Reset filters
			</Button>
		</div>
	</Empty.Content>
</Empty.Root>
