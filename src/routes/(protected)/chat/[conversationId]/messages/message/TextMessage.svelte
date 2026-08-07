<script lang="ts">
	import {
		type ApiResponseMessage,
		type TextMessage,
	} from "$lib/model/messaging/messages";
	import { getMessageContext, getMessageMetaContext } from "./context";
	import MessageReplyQuote from "./MessageReplyQuote.svelte";

	let {
		message,
		replyTo,
	}: { message: TextMessage["body"]; replyTo?: ApiResponseMessage | null } =
		$props();

	const { lastInStack, isOut } = $derived(getMessageContext()());
	const { clone, setRef, adornments } = $derived(getMessageMetaContext()());

	let el: HTMLDivElement | null = $state(null);
	$effect(() => {
		setRef(el ?? null);
	});
</script>

<div class={["flex max-w-[74%] flex-col", { "items-end": isOut }]}>
	<!-- No drawn tail: the last bubble in a stack tightens its inner bottom
	     corner instead, which points the stack at its sender on its own. -->
	<div
		class={[
			"relative w-fit max-w-full shrink-0 overflow-visible rounded-bubble px-3.5 py-2.75 text-row/[1.45] select-text",
			{
				"pointer-coarse:select-none": !clone,
				"bg-message-bubble-in text-message-bubble-foreground": !isOut,
				"rounded-es-bubble-tail": lastInStack && !isOut,
				"bg-message-bubble-out text-message-bubble-out-foreground":
					isOut,
				"rounded-ee-bubble-tail": lastInStack && isOut,
			},
		]}
		bind:this={el}
	>
		{#if replyTo}
			<MessageReplyQuote {replyTo} {isOut} />
		{/if}
		<!-- `wrap-anywhere` so a pasted link with no spaces in it breaks mid-word
	     instead of setting the bubble's minimum width to the whole URL. -->
		<span class="wrap-anywhere whitespace-pre-wrap">{message.text}</span>
		{@render adornments?.()}
	</div>
</div>
