<script lang="ts">
	import { untrack } from "svelte";

	import {
		getOrCreateConversationsState,
		setConversations,
	} from "$lib/chat/conversations-context.svelte";
	import ConversationsList from "./ConversationsList.svelte";

	// The tab shell's Inbox pane. It sits outside the chat layout, so it provides
	// the list's state itself; the state is account-scoped, so it is the same one
	// the layout hands the conversation.
	let {
		ourProfileId,
		active,
		filtersLocked = false,
	}: {
		ourProfileId: number;
		active: boolean;
		filtersLocked?: boolean;
	} = $props();

	setConversations(
		untrack(() => getOrCreateConversationsState(ourProfileId)),
	);
</script>

<main class="flex min-h-0 flex-1 flex-col">
	<ConversationsList covered={!active} {filtersLocked} />
</main>
