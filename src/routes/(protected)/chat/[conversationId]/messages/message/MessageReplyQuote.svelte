<script lang="ts">
	import { tick } from "svelte";
	import { toast } from "svelte-sonner";

	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import {
		type ApiResponseMessage,
		previewFromMessage,
		previewLabel,
		replyThumbnailUrl,
	} from "$lib/model/messaging/messages";
	import { scrollToMessage } from "$lib/util/scroll";
	import { getConversationState } from "../../conversation-state.svelte";
	import { getMessageMetaContext } from "./context";

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

<!-- Sits inside the bubble, above the reply's own body, so a reply and what it
     answers stay one block. The bar and fill are drawn from the bubble's own
     text colour, so this works on either side without knowing the theme. -->
<!-- The min-width is load-bearing: the bubble is `w-fit`, and both lines here
     truncate, so their min-content width is zero — without it a one-emoji reply
     would squeeze the quote down to "R… / Ph…". -->
<button
	type="button"
	class="mb-1.5 flex w-full min-w-45 items-stretch gap-2 overflow-hidden rounded-md bg-current/10 text-start active:bg-current/20"
	disabled={clone}
	aria-busy={jumping}
	onclick={(event) => {
		// The bubble row itself is a button (long-press menu, double-tap react);
		// jumping to the quoted message is this quote's own action.
		event.stopPropagation();
		jumpToQuoted().catch((error) => console.error(error));
	}}
>
	<span class="w-0.75 shrink-0 bg-current/40"></span>
	{#if thumbnail !== null}
		<MediaImage
			src={thumbnail}
			alt=""
			loading="lazy"
			class="size-9.5 shrink-0 self-center rounded-sm object-cover"
			aspectRatio="1 / 1"
		/>
	{/if}
	<div
		class="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-1.5 pe-2.5"
	>
		<span class="truncate text-2xs font-semibold">
			{isOut ? "Reply to them" : "Reply to me"}
		</span>
		<span class="truncate text-2xs opacity-70">{label}</span>
	</div>
</button>
