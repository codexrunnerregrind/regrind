<script lang="ts">
	import PaperPlaneTiltIcon from "phosphor-svelte/lib/PaperPlaneTiltIcon";

	import * as Empty from "$lib/components/ui/empty";
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<PaperPlaneTiltIcon weight="fill" />
		</Empty.Media>
		<Empty.Title>No Taps Sent</Empty.Title>
		<Empty.Description>
			Taps you send from <a href="/">Grid</a> or a profile show up here.
		</Empty.Description>
	</Empty.Header>
</Empty.Root>
