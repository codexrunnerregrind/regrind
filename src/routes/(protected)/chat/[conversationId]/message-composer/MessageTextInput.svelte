<script lang="ts">
	import type { Snippet } from "svelte";

	import { Textarea } from "$lib/components/ui/textarea";
	import { isMobilePlatform } from "$lib/platform/os";
	import { getMessageComposerContext } from "./message-composer-context.svelte";

	let {
		value = $bindable(),
		ref = $bindable(null),
		onEscape,
		trailing,
	}: {
		value: string;
		ref?: HTMLTextAreaElement | null;
		onEscape?: () => void;
		/** A button inside the field's end, on its last line. */
		trailing?: Snippet;
	} = $props();

	const isMobile = isMobilePlatform();

	const { disabled } = $derived(getMessageComposerContext()());
</script>

<div class="relative flex min-w-0 flex-1">
	<Textarea
		placeholder="Say something..."
		class={[
			"h-fit! max-h-31.5 min-h-10 flex-1 rounded-md border-0 bg-muted py-2.5 pl-3.5 leading-5 placeholder-shown:truncate",
			{ "pr-11": trailing, "pr-3.5": !trailing },
		]}
		enterkeyhint={isMobile ? "enter" : "send"}
		onkeydown={(
			event: KeyboardEvent & {
				currentTarget: EventTarget & HTMLTextAreaElement;
			},
		) => {
			if (event.key === "Escape") {
				event.preventDefault();
				onEscape?.();
				return;
			}
			if (!isMobile && event.key === "Enter" && !event.shiftKey) {
				event.preventDefault();
				event.currentTarget.form?.requestSubmit();
			}
		}}
		bind:value
		bind:ref
		{disabled}
	/>
	{#if trailing}
		<div class="absolute right-1 bottom-1">{@render trailing()}</div>
	{/if}
</div>
