<script lang="ts">
	import { untrack } from "svelte";

	import { getConversations } from "#lib/chat/conversations-context.svelte.ts";
	import PageTitle from "#lib/components/shared/PageTitle.svelte";
	import * as Card from "#lib/components/ui/card/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import { setScreenLeaving } from "#lib/platform/back-gesture-event.svelte.ts";
	import { followSoftKeyboard } from "#lib/platform/keyboard-follow.ts";
	import type { MessageDraft } from "#lib/model/messaging/messages.ts";
	import ChatNavBar from "./conversation-nav-bar/ConversationNavBar.svelte";
	import {
		ConversationState,
		setConversationState,
	} from "./conversation-state.svelte";
	import MessageComposer from "./message-composer/MessageComposer.svelte";
	import ConversationMessages from "./messages/ConversationMessages.svelte";

	let {
		conversationId,
		ourProfileId,
		leaving = false,
	}: {
		conversationId: string;
		ourProfileId: number;
		/** Sliding off the stack: keeps its messages but stops listening. */
		leaving?: boolean;
	} = $props();

	setScreenLeaving(() => leaving);

	const conversations = getConversations();

	let conversationState = $state(
		untrack(
			() =>
				new ConversationState({
					conversationId,
					ourProfileId,
					conversations,
				}),
		),
	);

	$effect(() => {
		const id = conversationId;
		const profileId = ourProfileId;
		if (leaving) return;

		const state = untrack(() => {
			if (
				id !== conversationState.conversationId ||
				profileId !== conversationState.ourProfileId ||
				conversationState.destroyed
			) {
				const next = new ConversationState({
					conversationId: id,
					ourProfileId: profileId,
					conversations,
				});
				conversationState = next;
				return next;
			}
			return conversationState;
		});

		return () => state.destroy();
	});

	setConversationState(() => conversationState);
</script>

{#if !leaving}
	<PageTitle
		page={conversationState.profile?.name ||
			t("chat.conversation.navBar.a11y.navigation")}
	/>
{/if}
<ChatNavBar />
<!-- Hides messages sliding under the status bar with the keyboard. -->
<div
	aria-hidden="true"
	class="pointer-events-none absolute inset-x-0 top-0 z-10 h-(--safe-area-top) transform-gpu max-split:bg-background split:bg-card"
></div>
<Card.Content
	class="relative flex min-h-0 flex-1 flex-col p-0"
	{@attach followSoftKeyboard}
>
	<ConversationMessages />
	<MessageComposer
		conversationId={conversationState.conversationId}
		onSend={(drafts: MessageDraft[]) => conversationState.send(drafts)}
		disabled={conversationState.loading || conversationState.error !== null}
		replyTo={conversationState.replyTo}
		onCancelReply={() => conversationState.clearReplyTo()}
		registerFocus={(focus) =>
			conversationState.registerComposerFocus(focus)}
	/>
</Card.Content>
