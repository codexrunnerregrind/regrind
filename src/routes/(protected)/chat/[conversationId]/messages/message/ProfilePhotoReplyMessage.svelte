<script lang="ts">
	import { profileMediaUrl } from "$lib/util/media";
	import type { ProfilePhotoReplyMessage } from "$lib/model/messaging/messages";
	import { getMessageContext, getMessageMetaContext } from "./context";
	import MessageQuoteBlock from "./MessageQuoteBlock.svelte";

	let { message }: { message: ProfilePhotoReplyMessage["body"] } = $props();

	const { lastInStack, isOut } = $derived(getMessageContext()());
	const { clone, setRef, adornments } = $derived(getMessageMetaContext()());

	const thumbnail = $derived(
		profileMediaUrl({ mediaHash: message.imageHash, size: "thumb" }),
	);

	let el: HTMLDivElement | null = $state(null);
	$effect(() => {
		setRef(el ?? null);
	});
</script>

<!-- A reply to somebody's profile photo, drawn as the same bubble a reply to a
     photo in the conversation is: the picture quoted above the reply's own
     text, inside one bubble. The quote is inert here — a profile photo is not a
     message in this conversation, so there is nothing to jump to. -->
<div class={["flex max-w-[74%] flex-col", { "items-end": isOut }]}>
	<div
		class={[
			"relative w-fit max-w-full shrink-0 overflow-visible rounded-bubble px-3.5 py-2.75 text-bubble/[1.45] select-text",
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
		<MessageQuoteBlock
			{thumbnail}
			title={isOut ? "Reply to them" : "Reply to me"}
			label="Profile photo"
		/>
		<span class="wrap-anywhere whitespace-pre-wrap">
			{message.photoContentReply}
		</span>
		{@render adornments?.()}
	</div>
</div>
