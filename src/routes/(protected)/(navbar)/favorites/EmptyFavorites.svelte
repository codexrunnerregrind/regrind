<script lang="ts">
	import StarIcon from "phosphor-svelte/lib/StarIcon";

	import * as Empty from "$lib/components/ui/empty";
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<StarIcon weight="fill" />
		</Empty.Media>
		<Empty.Title>No Favorites Yet</Empty.Title>
		<Empty.Description>
			Tap the star on someone's profile to add them here.
		</Empty.Description>
	</Empty.Header>
</Empty.Root>
