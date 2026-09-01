<script lang="ts">
	import { getMessageContext, getMessageMetaContext } from "./context";

	const { lastInStack, isOut } = $derived(getMessageContext()());
	const { clone, setRef, adornments } = $derived(getMessageMetaContext()());

	let el: HTMLDivElement | null = $state(null);
	$effect(() => {
		setRef(el ?? null);
	});
</script>

<div
	class={[
		"relative w-fit max-w-[74%] shrink-0 overflow-visible rounded-bubble bg-muted px-3.5 py-2.75 text-bubble/[1.45] text-muted-foreground italic select-text",
		{
			"pointer-coarse:select-none": !clone,
			"rounded-es-bubble-tail": lastInStack && !isOut,
			"rounded-ee-bubble-tail": lastInStack && isOut,
		},
	]}
	bind:this={el}
>
	<span class="whitespace-pre-wrap">Message unsent</span>
	{@render adornments?.()}
</div>
