<script lang="ts">
	import { showErrorToast } from "$lib/api/error-toast";
	import { hapticImpact } from "$lib/platform/haptics";
	import type {
		ApiResponseMessage,
		Message,
	} from "$lib/model/messaging/messages";
	import ComposerAttachments from "./attachments/ComposerAttachments.svelte";
	import ComposerReplyPreview from "./ComposerReplyPreview.svelte";
	import ComposerSubmitButton from "./ComposerSubmitButton.svelte";
	import { setMessageComposerContext } from "./message-composer-context.svelte";
	import MessageTextInput from "./MessageTextInput.svelte";
	import ComposerVoiceMessage from "./voice-message/ComposerVoiceMessage.svelte";

	let {
		onSend,
		disabled,
		replyTo,
		onCancelReply,
	}: {
		onSend: (params: Message) => void | Promise<void>;
		disabled: boolean;
		replyTo?: ApiResponseMessage | null;
		onCancelReply?: () => void;
	} = $props();

	let textContent = $state("");

	async function onSubmit() {
		const text = textContent.trim();
		if (text === "") return;
		try {
			await onSend({ type: "Text", body: { text } });
			hapticImpact("light");
			textContent = "";
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to send message", error });
		}
	}

	setMessageComposerContext(() => ({ disabled, sendMessage: onSend }));
</script>

<!-- In the flow rather than floating over the list: the messages then end
     exactly where this begins, whatever height it grows to. Measuring it and
     padding the list by that number instead left the newest message under the
     composer whenever the measurement lagged the layout — which on iOS it did
     until something else forced a resize. -->
<form
	class="flex min-h-11 min-w-0 shrink-0 flex-col gap-2 border-t border-border bg-background px-4.5 pt-3 pb-3"
	onpointerdown={(event) => {
		// Tapping the composer's own padding shouldn't dismiss the keyboard
		const target = event.target as HTMLElement | null;
		if (!target?.closest("textarea, input, button, a, [role='button']"))
			event.preventDefault();
	}}
	onsubmit={(event) => {
		event.preventDefault();
		onSubmit().catch((error) => console.error(error));
	}}
>
	{#if replyTo}
		<ComposerReplyPreview message={replyTo} onCancel={onCancelReply} />
	{/if}
	<!-- One row, three controls: attach, field, send. `items-end` keeps the two
	     buttons on the bottom line as the field grows to multiple lines. -->
	<div class="flex w-full items-end gap-2">
		<ComposerAttachments />
		<MessageTextInput bind:value={textContent} />
		<!-- Fixed slot: mic and send cross-fade over each other, so without a
		     reserved box the row would resize for a frame mid-swap. -->
		<div class="relative size-10 shrink-0">
			{#if textContent === ""}
				<ComposerVoiceMessage />
			{:else}
				<ComposerSubmitButton />
			{/if}
		</div>
	</div>
</form>
