<script lang="ts">
	import { onNavigate } from "$app/navigation";
	import { onDestroy, tick, untrack } from "svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import { getConversations } from "$lib/chat/conversations-context.svelte";
	import { draftFromMessage } from "$lib/model/messaging/messages";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import { hapticImpact } from "$lib/platform/haptics";
	import { below } from "$lib/util/breakpoints.svelte";
	import { bottomChrome } from "$lib/util/screen-chrome.svelte";
	import type {
		ApiResponseMessage,
		MessageDraft,
	} from "$lib/model/messaging/messages";
	import { getConversationState } from "../conversation-state.svelte";
	import ComposerAttachmentsTrigger from "./attachments/ComposerAttachmentsTrigger.svelte";
	import {
		type ComposerSheet,
		getComposerSheets,
	} from "./composer-sheets-state.svelte";
	import ComposerReplyPreview from "./ComposerReplyPreview.svelte";
	import ComposerSavedPhrases from "./ComposerSavedPhrases.svelte";
	import ComposerSubmitButton from "./ComposerSubmitButton.svelte";
	import { setMessageComposerContext } from "./message-composer-context.svelte";
	import MessageTextInput from "./MessageTextInput.svelte";
	import ComposerSendMedia from "./send-media/ComposerSendMedia.svelte";
	import ComposerStickersTrigger from "./stickers/ComposerStickersTrigger.svelte";
	import ComposerVoiceMessage from "./voice-message/ComposerVoiceMessage.svelte";
	import ComposerVoiceRecording from "./voice-message/ComposerVoiceRecording.svelte";
	import ComposerVoiceReview from "./voice-message/ComposerVoiceReview.svelte";
	import ComposerVoiceSendButton from "./voice-message/ComposerVoiceSendButton.svelte";
	import ComposerVoiceStopButton from "./voice-message/ComposerVoiceStopButton.svelte";
	import { VoiceMessageComposer } from "./voice-message/voice-message-composer.svelte";

	let {
		conversationId,
		onSend,
		disabled,
		replyTo,
		onCancelReply,
		registerFocus,
	}: {
		conversationId: string;
		onSend: (drafts: MessageDraft[]) => void | Promise<void>;
		disabled: boolean;
		replyTo?: ApiResponseMessage | null;
		onCancelReply?: () => void;
		/** Lends the field's focus out, so whoever arms a reply can take the
		 *  caret in the same task as the gesture. Returns a disposer. */
		registerFocus?: (focus: () => void) => () => void;
	} = $props();

	const { drafts } = getConversations();
	const sheets = getComposerSheets();
	const mobile = below("split");

	let textContent = $state(untrack(() => drafts.get(conversationId)));
	let textInput: HTMLTextAreaElement | null = $state(null);
	let stickersTrigger: HTMLElement | null = $state(null);
	let attachmentsTrigger: HTMLElement | null = $state(null);

	async function onSubmit() {
		const text = textContent.trim();
		if (text === "") return;
		try {
			await onSend([draftFromMessage({ type: "Text", body: { text } })]);
			hapticImpact("light");
			textContent = "";
			drafts.discard(conversationId);
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to send message", error });
		}
	}

	$effect(() => {
		const openedConversationId = conversationId;
		untrack(() => {
			const stored = drafts.open(openedConversationId);
			if (textContent === stored) return;
			textContent = stored;
		});
		return () =>
			drafts.save({
				conversationId: openedConversationId,
				text: textContent,
			});
	});

	$effect(() => {
		drafts.autosave({ conversationId, text: textContent });
	});

	onNavigate(({ to }) => {
		if (to?.params?.conversationId !== conversationId)
			drafts.save({ conversationId, text: textContent });
	});

	// Arming a reply should hand the user straight back to the composer, which
	// on touch is also what raises the keyboard. The focus has to happen in the
	// same task as the gesture that armed the reply, or iOS raises the keyboard
	// without making room for it — so the state calls this the moment the reply
	// is set, and the effect below is left only to cover a replyTo that arrives
	// from anywhere else.
	$effect(() => registerFocus?.(() => textInput?.focus()));

	$effect(() => {
		if (!replyTo || !textInput) return;
		if (untrack(() => sheets.hasOpenSheet({ conversationId }))) return;
		textInput.focus();
	});

	dismissOnBackGesture({
		active: () => replyTo !== null && replyTo !== undefined,
		dismiss: () => onCancelReply?.(),
		layer: "screen",
	});

	const voice = untrack(
		() => new VoiceMessageComposer((drafts) => onSend(drafts)),
	);

	// Leaving the conversation mid-hold must not leave the microphone open.
	$effect(() => () => voice.abandon());

	// Tapping the composer's own padding shouldn't dismiss the keyboard — a
	// near-miss on a chip or a button lands here. Both events, because WebKit
	// ignores preventDefault on a touch-derived pointerdown and only honours the
	// mousedown it dispatches after touchend.
	function keepKeyboardOnPadding(event: Event) {
		const target = event.target as HTMLElement | null;
		if (!target?.closest("textarea, input, button, a, [role='button']"))
			event.preventDefault();
	}

	function focusTrigger({ sheet }: { sheet: ComposerSheet }) {
		const trigger =
			sheet === "attachments" && attachmentsTrigger?.isConnected
				? attachmentsTrigger
				: stickersTrigger;
		trigger?.focus();
	}

	const composerContext = () => ({
		conversationId,
		disabled,
		sendMessages: onSend,
		voice,
	});
	setMessageComposerContext(composerContext);
	onDestroy(
		sheets.bind({
			conversationState: getConversationState(),
			context: composerContext,
			focusTrigger,
		}),
	);
</script>

<!-- In the flow rather than floating over the list: the messages then end
     exactly where this begins, whatever height it grows to. Measuring it and
     padding the list by that number instead left the newest message under the
     composer whenever the measurement lagged the layout — which on iOS it did
     until something else forced a resize. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form
	data-slot="message-composer"
	class="flex min-h-11 min-w-0 shrink-0 flex-col gap-2 border-t border-border bg-background px-4.5 pt-3 pb-3"
	{@attach mobile.current && bottomChrome}
	onpointerdown={keepKeyboardOnPadding}
	onmousedown={keepKeyboardOnPadding}
	onsubmit={(event) => {
		event.preventDefault();
		onSubmit().catch((error) => console.error(error));
	}}
>
	{#if replyTo}
		<ComposerReplyPreview message={replyTo} onCancel={onCancelReply} />
	{/if}
	<!-- Picking a phrase replaces the draft outright rather than appending to it:
	     the chips are openers, and a half-typed line is what you reached for one
	     instead of. The field is deliberately not focused: the bar leaves the
	     keyboard however it found it, raised or down. -->
	<ComposerSavedPhrases
		draft={textContent}
		onSelect={(text) => {
			textContent = text;
			// Focus rides the tap that picked the phrase, which is what raises the
			// keyboard on touch — a phrase is an opener you carry on typing from,
			// so the caret goes to the end of it rather than the start.
			const field = textInput;
			field?.focus();
			void tick().then(() =>
				field?.setSelectionRange(text.length, text.length),
			);
		}}
	/>
	<!-- One row: attach, stickers, field, send. `items-end` keeps the two
	     buttons on the bottom line as the field grows to multiple lines. -->
	<div class="relative flex w-full items-end gap-2">
		<ComposerAttachmentsTrigger
			bind:ref={attachmentsTrigger}
			onClick={() =>
				sheets.setOpen({
					conversationId,
					sheet: "attachments",
					open: true,
				})}
		/>
		<ComposerStickersTrigger
			bind:ref={stickersTrigger}
			onClick={() =>
				sheets.setOpen({
					conversationId,
					sheet: "stickers",
					open: true,
				})}
		/>
		<MessageTextInput
			bind:value={textContent}
			bind:ref={textInput}
			onEscape={onCancelReply}
		/>
		<!-- Fixed slot: mic and send cross-fade over each other, so without a
		     reserved box the row would resize for a frame mid-swap. The mic stays
		     put through a recording — swapping it out mid-hold would drop the
		     pointer capture the gesture rides on. -->
		<!-- Above the recording bar, not behind it: the mic travels left across the
		     bar as the drag goes, and sliding underneath it looked like a fault. -->
		<div class="relative z-20 size-10 shrink-0">
			{#if voice.locked}
				<ComposerVoiceStopButton />
			{:else if voice.reviewing}
				<ComposerVoiceSendButton />
			{:else if textContent === "" || voice.active}
				<ComposerVoiceMessage />
			{:else}
				<ComposerSubmitButton />
			{/if}
		</div>
		{#if voice.reviewing}
			<ComposerVoiceReview />
		{:else if voice.active}
			<ComposerVoiceRecording />
		{/if}
	</div>
	{#key conversationId}
		<ComposerSendMedia />
	{/key}
</form>
