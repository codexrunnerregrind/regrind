<script lang="ts">
	import LightningIcon from "phosphor-svelte/lib/LightningIcon";

	import * as Card from "$lib/components/ui/card";

	let { text }: { text: string | null } = $props();

	const said = $derived(text !== null && text.trim() !== "");
</script>

<!-- Marked as a Right Now post rather than left to look like the bio further
     down: the bolt is the glyph the Right Now tab already wears, the fuchsia is
     the color the indicator beside the online status and the grid tiles use. The
     words "Right Now" are not repeated — the row above says them already, an inch
     away.

     What they said, and only that: whether they are up for something is carried
     next to the online status by RightNowStatus.svelte rather than in here. -->
{#if said}
	<Card.Root class="mt-4 rounded-xl bg-fuchsia-600/5">
		<Card.Content class="flex items-start gap-2.5">
			<LightningIcon
				weight="fill"
				class="mt-0.5 size-4 shrink-0 text-fuchsia-600"
				aria-hidden="true"
			/>
			<p
				class="text-pretty wrap-break-word whitespace-pre-wrap select-text"
			>
				{text}
			</p>
		</Card.Content>
	</Card.Root>
{/if}
