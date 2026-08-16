<script lang="ts">
	import { tick } from "svelte";
	import { toast } from "svelte-sonner";

	import {
		type ApiResponseMessage,
		previewFromMessage,
		previewLabel,
		replyThumbnailUrl,
	} from "$lib/model/messaging/messages";
	import { scrollToMessage } from "$lib/util/scroll";
	import { getConversationState } from "../../conversation-state.svelte";
	import { getMessageMetaContext } from "./context";
	import MessageQuoteBlock from "./MessageQuoteBlock.svelte";

	let {
		replyTo,
		isOut,
	}: {
		replyTo: ApiResponseMessage;
		/** Whose bubble the quote is sitting in — the label says so. */
		isOut: boolean;
	} = $props();

	const label = $derived(previewLabel(previewFromMessage(replyTo)));

	const thumbnail = $derived(replyThumbnailUrl(replyTo));

	// The context-menu clone sits over the list, so jumping from it would scroll
	// something the user cannot see.
	const { clone } = $derived(getMessageMetaContext()());

	const conversationState = $derived(getConversationState()());

	let jumping = $state(false);

	/** Older pages a jump will pull in before giving up on the quoted message. */
	const MAX_JUMP_PAGES = 10;

	/**
	 * A conversation opens with only its latest page loaded, so a quote usually
	 * points above the loaded window — page older messages in until its bubble
	 * exists rather than declaring it missing. Bounded because a quote can point at
	 * a message deleted locally, which no amount of paging will ever surface.
	 */
	async function jumpToQuoted() {
		if (scrollToMessage(replyTo.messageId) || jumping) return;
		jumping = true;
		try {
			for (let page = 0; page < MAX_JUMP_PAGES; page++) {
				const before = conversationState.pageKey;
				if (before === null) break;
				await conversationState.loadMore();
				await tick();
				if (scrollToMessage(replyTo.messageId)) return;
				// A concurrent load (the pagination sentinel) no-ops loadMore, so an
				// unmoved page key means this loop is getting nowhere.
				if (conversationState.pageKey === before) break;
			}
			toast.info("Can't find that message");
		} finally {
			jumping = false;
		}
	}
</script>

<MessageQuoteBlock
	{thumbnail}
	title={isOut ? "Reply to them" : "Reply to me"}
	label={label ?? ""}
	busy={jumping}
	onclick={clone
		? undefined
		: (event) => {
				// The bubble row itself is a button (long-press menu, double-tap
				// react); jumping to the quoted message is this quote's own action.
				event.stopPropagation();
				jumpToQuoted().catch((error) => console.error(error));
			}}
/>
