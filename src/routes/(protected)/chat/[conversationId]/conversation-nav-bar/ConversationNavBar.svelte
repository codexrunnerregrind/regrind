<script lang="ts">
	import { ArrowLeftIcon } from "phosphor-svelte";

	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { getConversationState } from "../conversation-state.svelte";
	import ConversationActionsMenu from "./ConversationActionsMenu.svelte";
	import ConversationNavBarProfile from "./ConversationNavBarProfile.svelte";
	import ConversationSharedAlbums from "./ConversationSharedAlbums.svelte";

	const conversationState = $derived(getConversationState()());
</script>

<ProgressiveBlur
	direction="topToBottom"
	class="absolute z-10 h-19 w-full shrink-0"
	bgClass="bg-linear-to-b max-split:from-background split:from-card to-transparent split:[--pblur-flat:var(--color-card)]"
	contentClass="flex items-center h-full"
	tag="nav"
>
	<a
		href="/chat"
		aria-label="Back to chats"
		class="flex h-full items-center py-4 pr-1 pl-3"
	>
		<ArrowLeftIcon size={26} />
	</a>
	{#if conversationState.profile !== null}
		<ConversationNavBarProfile
			profile={conversationState.profile}
			typing={conversationState.typing}
		/>
		<ConversationSharedAlbums
			profileId={conversationState.profile.profileId}
			name={conversationState.profile.name}
		/>
		<ConversationActionsMenu
			profileId={conversationState.profile.profileId}
		/>
	{:else if conversationState.error}
		<span class="flex-1">Failed to load conversation</span>
	{:else}
		<div class="flex flex-1 items-center gap-3 py-4 ps-1">
			<Skeleton class="size-avatar rounded-full" />
			<div class="flex flex-col gap-2">
				<Skeleton class="h-4 w-20 rounded-md" />
				<Skeleton class="h-3 w-12 rounded-md" />
			</div>
		</div>
	{/if}
</ProgressiveBlur>
