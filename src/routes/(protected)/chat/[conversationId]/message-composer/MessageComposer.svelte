<script lang="ts">
	import { showErrorToast } from "$lib/api/error";
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
		height = $bindable(0),
	}: {
		onSend: (params: Message) => void | Promise<void>;
		disabled: boolean;
		replyTo?: ApiResponseMessage | null;
		onCancelReply?: () => void;
		height?: number;
	} = $props();

	let textContent = $state("");
	let form: HTMLFormElement | null = $state(null);

	async function onSubmit() {
		const text = textContent.trim();
		if (text === "") return;
		try {
			await onSend({ type: "Text", body: { text } });
			hapticImpact("light");
			textContent = "";
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: "Failed to send message",
				error,
			});
		}
	}

	setMessageComposerContext(() => ({
		disabled,
		sendMessage: onSend,
	}));
</script>

<form
	bind:this={form}
	class="absolute bottom-0 z-20 flex min-h-11 w-full min-w-0 shrink-0 flex-col gap-1 px-2 pb-2"
	bind:clientHeight={height}
	oninput={() => {
		// WebKit bug: resive observer emits event a frame late,
		// painting the taller composer over the newest message once
		if (form) height = form.clientHeight;
	}}
	onsubmit={(event) => {
		event.preventDefault();
		onSubmit().catch((error) => console.error(error));
	}}
>
	{#if replyTo}
		<ComposerReplyPreview message={replyTo} onCancel={onCancelReply} />
	{/if}
	<div class="relative h-full w-full rounded-composer bg-popover">
		<MessageTextInput bind:value={textContent} />
		<ComposerAttachments />
		{#if textContent === ""}
			<ComposerVoiceMessage />
		{:else}
			<ComposerSubmitButton />
		{/if}
	</div>
</form>
