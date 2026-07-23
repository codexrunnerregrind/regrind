<script lang="ts">
	import {
		type ApiResponseMessage,
		type TextMessage,
		previewFromMessage,
		previewLabel,
	} from "$lib/model/messaging/messages";
	import { getMessageContext, getMessageMetaContext } from "./context";
	import MessageTail from "./MessageTail.svelte";

	let {
		message,
		replyTo,
	}: {
		message: TextMessage["body"];
		replyTo?: ApiResponseMessage | null;
	} = $props();

	const { lastInStack, isOut } = $derived(getMessageContext()());
	const { clone, setRef, adornments } = $derived(getMessageMetaContext()());

	const replyLabel = $derived(
		replyTo ? previewLabel(previewFromMessage(replyTo)) : null,
	);

	let el: HTMLDivElement | null = $state(null);
	$effect(() => {
		setRef(el ?? null);
	});
</script>

<div
	class={[
		"flex flex-col",
		{
			"items-end": isOut,
		},
	]}
>
	{#if replyLabel !== null}
		<div
			class={[
				"mb-1 flex items-end",
				{
					"ms-4": !isOut,
					"me-4": isOut,
					"flex-row-reverse": isOut,
				},
			]}
		>
			<div
				class={[
					"h-4 w-5 border-muted-foreground/50",
					{
						"ms-3 rounded-tl-[8px] border-t-2 border-l-2": !isOut && !clone,
						"me-3 self-end rounded-tr-[8px] border-t-2 border-r-2":
							isOut && !clone,
					},
				]}
			></div>
			<div
				class={[
					"w-fit max-w-100 truncate rounded-xl bg-muted px-3 py-1.5 text-sm text-muted-foreground",
					{
						"ms-1": !isOut && !clone,
						"me-1": isOut && !clone,
					},
				]}
			>
				{replyLabel}
			</div>
		</div>
	{/if}
	<div
		class={[
			"relative w-fit max-w-100 shrink-0 overflow-visible rounded-xl px-3 py-2 text-message-bubble-foreground select-text",
			{
				"pointer-coarse:select-none": !clone,
				"bg-message-bubble-in": !isOut,
				"ms-3": !isOut && !clone,
				"rounded-es-none": lastInStack && !isOut,
				"bg-message-bubble-out": isOut,
				"me-3": isOut && !clone,
				"rounded-ee-none": lastInStack && isOut,
			},
		]}
		bind:this={el}
	>
		{#if lastInStack}
			<MessageTail
				{isOut}
				class={{
					"fill-message-bubble-in": !isOut,
					"fill-message-bubble-out": isOut,
				}}
			/>
		{/if}
		<span class="whitespace-pre-wrap">{message.text}</span>
		{@render adornments?.()}
	</div>
</div>
