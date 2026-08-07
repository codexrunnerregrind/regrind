<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { PushPinIcon } from "phosphor-svelte";
	import { onMount, tick, untrack } from "svelte";

	import { getConversations } from "$lib/chat/conversations-context.svelte";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import ListRowSkeleton from "$lib/components/feedback/ListRowSkeleton.svelte";
	import UnderlineTabs from "$lib/components/shared/UnderlineTabs.svelte";
	import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
	import { hapticImpact, hapticSelection } from "$lib/platform/haptics";
	import { below } from "$lib/util/breakpoints.svelte";
	import { SelectionSet } from "$lib/util/selection.svelte";
	import { swipeTabs } from "$lib/util/swipe-tabs";
	import type {
		ConversationsState,
		InboxTab,
	} from "$lib/chat/conversations-state.svelte";
	import type { Conversation as ConversationEntry } from "$lib/model/messaging/conversations";
	import AlbumsTab from "./AlbumsTab.svelte";
	import Conversation from "./Conversation.svelte";
	import ConversationsSelectionBar from "./ConversationsSelectionBar.svelte";
	import DeleteConversationsDialog from "./DeleteConversationsDialog.svelte";
	import EmptyConversationsList from "./EmptyConversationsList.svelte";
	import LazyConversation from "./LazyConversation.svelte";

	const EAGER_COUNT = 10;

	const conversations: ConversationsState = getConversations();
	const mobile = below("split");

	const latestActivity = $derived(
		conversations.entries.reduce(
			(max, entry) => Math.max(max, entry.data.lastActivityTimestamp),
			0,
		),
	);
	$effect(() => {
		// Fixes effect_update_depth_exceeded
		void latestActivity;
		untrack(() => conversations.markInboxViewed());
	});

	let container: HTMLDivElement | null = $state(null);

	onMount(() => {
		void conversations.initial.then(tick).then(() => {
			if (container && conversations.scrollY > 0) {
				container.scrollTop = conversations.scrollY;
			}
		});
	});

	let {
		class: className,
	}: {
		class?: import("svelte/elements").ClassValue;
	} = $props();

	// "Messages" rather than "Inbox": the screen title above already says Inbox,
	// so the tab names the list instead of repeating it.
	const tabs: { value: InboxTab; label: string }[] = [
		{ value: "inbox", label: "Messages" },
		{ value: "albums", label: "Albums" },
	];
	// Held on the shared state, not locally, so it survives leaving this screen.
	const activeTab = $derived(conversations.activeTab);

	function selectTab(value: string) {
		if (value === activeTab) return;
		hapticSelection();
		conversations.activeTab = value as InboxTab;
	}

	function cycleTab(delta: number) {
		const index = tabs.findIndex((tab) => tab.value === activeTab);
		const next = tabs[index + delta];
		if (next) selectTab(next.value);
	}

	const selection = new SelectionSet<string>();
	let selecting = $state(false);
	let deleteDialogOpen = $state(false);
	let deleteIds: string[] = $state([]);

	async function compensateScroll() {
		if (!container) return;
		const paddingBefore = parseFloat(getComputedStyle(container).paddingTop);
		const scrollBefore = container.scrollTop;
		await tick();
		if (!container) return;
		const delta =
			parseFloat(getComputedStyle(container).paddingTop) - paddingBefore;
		if (delta !== 0) {
			container.scrollTop = Math.max(0, scrollBefore + delta);
		}
	}

	const selectedEntries = $derived(
		conversations.entries.filter((entry) =>
			selection.has(entry.data.conversationId),
		),
	);
	const allPinned = $derived(
		selectedEntries.length > 0 &&
			selectedEntries.every((entry) => entry.data.pinned),
	);
	const allMuted = $derived(
		selectedEntries.length > 0 &&
			selectedEntries.every((entry) => entry.data.muted),
	);

	function enterSelection(conversationId: string) {
		if (!selecting) {
			selecting = true;
			hapticImpact("medium");
			void compensateScroll();
		}
		selection.add(conversationId);
	}

	function exitSelection() {
		if (selecting) {
			selecting = false;
			void compensateScroll();
		}
		selection.clear();
	}

	$effect(() => {
		if (selecting && (!mobile.current || selection.size === 0)) {
			exitSelection();
		}
	});

	$effect(() => {
		if (!selecting) return;
		const known = new Set(
			conversations.entries.map((entry) => entry.data.conversationId),
		);
		for (const conversationId of selection.values()) {
			if (!known.has(conversationId)) selection.delete(conversationId);
		}
	});

	$effect(() => {
		if (!selecting && !deleteDialogOpen) return;
		const onBackGesture = () => {
			if (deleteDialogOpen) {
				deleteDialogOpen = false;
			} else {
				exitSelection();
			}
			return false;
		};
		backGestureEventHandlers.add(onBackGesture);
		return () => {
			backGestureEventHandlers.delete(onBackGesture);
		};
	});

	function pinSelected() {
		const conversationIds = selection.values();
		const pinned = !allPinned;
		exitSelection();
		void conversations.setPinned({ conversationIds, pinned });
	}

	function muteSelected() {
		const conversationIds = selection.values();
		const muted = !allMuted;
		exitSelection();
		void conversations.setMuted({ conversationIds, muted });
	}

	function requestDelete(conversationIds: string[]) {
		deleteIds = conversationIds;
		deleteDialogOpen = true;
	}

	async function confirmDelete() {
		hapticImpact("medium");
		exitSelection();
		if (deleteIds.some((id) => id === page.params.conversationId)) {
			await goto("/chat");
		}
		const known = new Set(
			conversations.entries.map((entry) => entry.data.conversationId),
		);
		const conversationIds = deleteIds.filter((id) => known.has(id));
		if (conversationIds.length === 0) return;
		void conversations.deleteConversations(conversationIds);
	}

	// Pinned conversations lift out of the list into their own card so the list
	// below reads as one uninterrupted run. `entries` is already sorted
	// pinned-first, so this is a partition, not a re-order.
	const pinnedEntries = $derived(
		conversations.entries.filter((entry) => entry.data.pinned),
	);
	const restEntries = $derived(
		conversations.entries.filter((entry) => !entry.data.pinned),
	);

	function observeSentinel(node: HTMLElement) {
		const observer = new IntersectionObserver(
			(es) => {
				if (es[0]?.isIntersecting)
					conversations.loadMore().catch((error) => console.error(error));
			},
			{ rootMargin: "400px" },
		);
		observer.observe(node);
		return {
			destroy() {
				observer.disconnect();
			},
		};
	}
</script>

{#snippet row(conversation: ConversationEntry, eager: boolean)}
	{@const conversationId = conversation.data.conversationId}
	{@const props = {
		conversation,
		selection: selecting ? selection : null,
		onEnterSelection: mobile.current
			? () => enterSelection(conversationId)
			: undefined,
		onRequestDelete: () => requestDelete([conversationId]),
	}}
	{#if eager}
		<Conversation {...props} />
	{:else}
		<LazyConversation {...props} />
	{/if}
{/snippet}

{#if selecting}
	<ConversationsSelectionBar
		count={selection.size}
		{allPinned}
		{allMuted}
		onPin={pinSelected}
		onMute={muteSelected}
		onDelete={() => requestDelete(selection.values())}
		onClose={exitSelection}
	/>
{/if}
<DeleteConversationsDialog
	bind:open={deleteDialogOpen}
	count={deleteIds.length}
	onConfirm={() => void confirmDelete()}
/>

<div
	class="relative flex h-full w-full min-w-list-rail flex-col"
	use:swipeTabs={{
		enabled: mobile.current,
		onNext: () => cycleTab(1),
		onPrev: () => cycleTab(-1),
	}}
>
	<div class="shrink-0 px-screen pt-4">
		<h1 class="screen-title">Inbox</h1>
		<UnderlineTabs {tabs} value={activeTab} onSelect={selectTab} class="mt-4" />
	</div>
	{#if activeTab === "albums"}
		<AlbumsTab class={className} />
	{:else}
		<div
			bind:this={container}
			data-scroll-root
			class={[
				"flex min-h-0 flex-1 flex-col gap-0 overflow-auto overscroll-contain px-0 pt-1 pb-0",
				{ "pt-(--selection-bar-height)": selecting },
				className,
			]}
			onscroll={() => (conversations.scrollY = container?.scrollTop ?? 0)}
		>
			{#await conversations.initial}
				{#each Array(8)}
					<ListRowSkeleton />
				{/each}
			{:then}
				<div
					class="flex min-h-overscrollable shrink-0 flex-col gap-0 pb-nav-clear"
				>
					{#if pinnedEntries.length > 0}
						<div class="flex items-center gap-1.5 px-screen pt-5.5 pb-2.5">
							<PushPinIcon weight="fill" class="size-3 text-ink3" />
							<span class="section-label">Pinned</span>
						</div>
						<!-- The card closes the group, so the last row's separator would
						     draw a stray line just inside its bottom edge. -->
						<div
							class="pinned-group mx-screen overflow-hidden rounded-xl bg-card [&>:last-child_a]:after:border-b-0"
						>
							{#each pinnedEntries as conversation (conversation.data.conversationId)}
								{@render row(conversation, true)}
							{/each}
						</div>
						<div class="h-5"></div>
					{/if}
					{#each restEntries as conversation, i (conversation.data.conversationId)}
						{@render row(conversation, i < EAGER_COUNT)}
					{:else}
						{#if pinnedEntries.length === 0}
							<EmptyConversationsList />
						{/if}
					{/each}
					{#if conversations.loadingMore}
						{#each Array(6)}
							<ListRowSkeleton />
						{/each}
					{/if}
					{#if conversations.nextPage !== null}
						<div class="h-0" use:observeSentinel></div>
					{/if}
				</div>
			{:catch error}
				<div class="flex flex-1">
					<ApiErrorDisplay
						{error}
						onRetry={() => conversations.retry()}
						class="m-auto"
					/>
				</div>
			{/await}
		</div>
		{#await conversations.initial then}
			<DataRefreshControl
				{container}
				updating={conversations.refreshing}
				position="top"
				hintOffset={12}
				onrefresh={() => {
					hapticImpact("light");
					void conversations.refresh();
				}}
			/>
		{/await}
	{/if}
</div>

<style lang="postcss">
	@reference "$layout";

	/* A row inside the pinned card is square, but the card clips to a 12px
	   radius — so the selected state's outline (and its tint overlay, which
	   inherits the radius) had its corners sliced off. Rounding the row to the
	   card's own radius makes both follow the curve. */
	.pinned-group :global([data-slot="item"]) {
		@apply rounded-xl;
	}
</style>
