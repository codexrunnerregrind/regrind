<script lang="ts">
	import CodeIcon from "phosphor-svelte/lib/CodeIcon";

	import Link from "./LinkItem.svelte";
</script>

<Link
	destination="https://git.opengrind.org/codexrunner/open-grind"
	label="ReGrind Source Code"
>
	{#snippet icon()}
		<CodeIcon weight="fill" />
	{/snippet}
</Link>
