<script lang="ts">
	import { Badge } from "$lib/components/ui/badge";

	let {
		tags,
		ourTags,
		ourProfile = false,
	}: {
		tags: string[] | null;
		ourTags: string[] | undefined;
		ourProfile?: boolean;
	} = $props();
</script>

{#if tags !== null && tags.length > 0}
	<div class="mt-3.5 flex flex-wrap items-center gap-1.5">
		{#each tags as tag (tag)}
			<Badge
				variant={!ourProfile && ourTags?.includes(tag)
					? "default"
					: "secondary"}
				class="rounded-md border-transparent px-2.75 py-1.5 text-preview font-medium"
			>
				{tag}
			</Badge>
		{/each}
	</div>
{/if}
