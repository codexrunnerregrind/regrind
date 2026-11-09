<script lang="ts">
	import type { Snippet } from "svelte";

	import { Textarea } from "$lib/components/ui/textarea";
	import { isMobilePlatform } from "$lib/platform/os";

	let {
		value = $bindable(),
		ref = $bindable(null),
		onEscape,
		placeholder,
		padding,
		disabled,
		onkeydown,
		trailing,
		...props
	}: import("svelte").ComponentProps<typeof Textarea> & {
		padding: string;
		onEscape?: () => void;
		/** A button inside the field's end, on its last line. */
		trailing?: Snippet;
	} = $props();

	const isMobile = isMobilePlatform();
</script>

<div class="relative flex min-w-0 flex-1">
	<Textarea
		{...props}
		{placeholder}
		class={[
			"h-fit! max-h-31.5 min-h-10 flex-1 rounded-md border-0 bg-muted py-2.5 leading-5 placeholder-shown:truncate",
			padding,
		]}
		enterkeyhint={isMobile ? "enter" : "send"}
		onkeydown={(
			event: KeyboardEvent & {
				currentTarget: EventTarget & HTMLTextAreaElement;
			},
		) => {
			onkeydown?.(event);
			if (event.key === "Escape" && onEscape) {
				event.preventDefault();
				onEscape();
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
