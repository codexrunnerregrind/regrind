<script lang="ts">
	import { Label } from "$lib/components/ui/label";
	import { Switch } from "$lib/components/ui/switch";

	let {
		id,
		checked = $bindable(),
		children,
	}: {
		id: string;
		checked: boolean;
		children?: import("svelte").Snippet;
	} = $props();

	const uid = $props.id();
</script>

<div class="flex w-full items-center gap-3 px-3 py-3">
	<Label for="filters-{id}-{uid}" class="min-w-0 flex-1 text-sm font-normal">
		{@render children?.()}
	</Label>
	<Switch id="filters-{id}-{uid}" bind:checked />
</div>
