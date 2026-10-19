<script lang="ts">
	import CodeIcon from "phosphor-svelte/lib/CodeIcon";

	import Link from "./LinkItem.svelte";
</script>

<Link
	destination="https://github.com/codexrunnerregrind/regrind"
	label="ReGrind Source Code"
>
	{#snippet icon()}
		<CodeIcon weight="fill" />
	{/snippet}
</Link>
