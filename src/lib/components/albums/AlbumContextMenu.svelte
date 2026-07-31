<script lang="ts">
	import TrashIcon from "phosphor-svelte/lib/TrashIcon";
	import type { ComponentProps } from "svelte";

	import ContextMenu from "$lib/components/shared/ContextMenu.svelte";
	import { Button } from "$lib/components/ui/button";

	let {
		removeLabel,
		onRemove,
		...props
	}: ComponentProps<typeof ContextMenu> & {
		removeLabel: string;
		onRemove: () => void;
	} = $props();
</script>

<ContextMenu {...props}>
	{#snippet children()}
		<div class="buttons w-45">
			<Button
				variant="ghost"
				onclick={() => {
					onRemove();
					props.onClose();
				}}
			>
				<TrashIcon />
				{removeLabel}
			</Button>
		</div>
	{/snippet}
</ContextMenu>

<style lang="postcss">
	@reference "$layout";

	.buttons {
		@apply flex flex-col rounded-xl bg-black/80 p-1 *:justify-start *:active:translate-y-0!;
	}
</style>
