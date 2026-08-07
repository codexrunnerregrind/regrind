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
	class="absolute bottom-0 z-20 flex min-h-11 w-full min-w-0 shrink-0 flex-col gap-2 border-t border-border bg-background px-3 pt-3 pb-3"
	bind:clientHeight={height}
	oninput={() => {
		// WebKit bug: resive observer emits event a frame late,
		// painting the taller composer over the newest message once
		if (form) height = form.clientHeight;
	}}
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
