<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import PushPinIcon from "phosphor-svelte/lib/PushPinIcon";
	import { onDestroy, tick } from "svelte";

	import { getConversations } from "$lib/chat/conversations-context.svelte";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import ListRowSkeleton from "$lib/components/feedback/ListRowSkeleton.svelte";
	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import ScrollToTopButton from "$lib/components/shared/ScrollToTopButton.svelte";
	import UnderlineTabs from "$lib/components/shared/UnderlineTabs.svelte";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import { hapticImpact, hapticSelection } from "$lib/platform/haptics";
	import { below } from "$lib/util/breakpoints.svelte";
	import { restoreScrollOnce } from "$lib/util/scroll-restore.svelte";
	import { SelectionSet } from "$lib/util/selection.svelte";
	import { swipeTabs } from "$lib/util/swipe-tabs";
	import type {
		ConversationsState,
		InboxTab,
	} from "$lib/chat/conversations-state.svelte";
	import type { Conversation as ConversationEntry } from "$lib/model/messaging/conversations";
	import AlbumsTab from "./AlbumsTab.svelte";
	import ConversationsFilters from "./ConversationsFilters.svelte";
	import ConversationsPagingTail from "./ConversationsPagingTail.svelte";
	import ConversationsSelectionBar from "./ConversationsSelectionBar.svelte";
	import DeleteConversationsDialog from "./DeleteConversationsDialog.svelte";
	import LazyConversation from "./LazyConversation.svelte";
	import { MountQueue } from "./mount-queue";

	let {
		covered = false,
		filtersLocked = false,
		class: className,
	}: {
		covered?: boolean;
		filtersLocked?: boolean;
		class?: import("svelte/elements").ClassValue;
	} = $props();

	const EAGER_COUNT = 10;

	const conversations: ConversationsState = getConversations();
	const mobile = below("split");
	const visibleEntries = $derived(conversations.visibleEntries);
	const mountQueue = new MountQueue();

	onDestroy(() => mountQueue.destroy());

	$effect(() => {
		if (!covered) conversations.noteListViewed();
	});

	let container: HTMLDivElement | null = $state(null);

	restoreScrollOnce({ container: () => container, state: conversations });

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

	// False past either end, handing the swipe to the tab-bar swipe around this
	// list: a flick past Albums carries on to the You tab.
	function cycleTab(delta: number): boolean {
		const index = tabs.findIndex((tab) => tab.value === activeTab);
		const next = tabs[index + delta];
		if (!next) return false;
		selectTab(next.value);
		return true;
	}

	const selection = new SelectionSet<string>();
	let selecting = $state(false);
	let deleteDialogOpen = $state(false);
	let deleteIds: string[] = $state([]);

	async function compensateScroll() {
		if (!container) return;
		const paddingBefore = parseFloat(
			getComputedStyle(container).paddingTop,
		);
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
		if (selecting && (!mobile.current || covered || selection.size === 0)) {
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

	dismissOnBackGesture({
		active: () => selecting,
		dismiss: exitSelection,
		layer: "screen",
	});
	dismissOnBackGesture({
		active: () => deleteDialogOpen,
		dismiss: () => {
			deleteDialogOpen = false;
		},
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
		visibleEntries.filter((entry) => entry.data.pinned),
	);
	const restEntries = $derived(
		visibleEntries.filter((entry) => !entry.data.pinned),
	);
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
	<LazyConversation {...props} {eager} queue={mountQueue} />
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
		<UnderlineTabs
			{tabs}
			value={activeTab}
			onSelect={selectTab}
			class="mt-4"
		/>
	</div>
	{#if activeTab === "albums"}
		<AlbumsTab class={className} />
	{:else}
		<!-- The row sits over the list rather than above it, as the grid's quick
		     filters do: rows scroll behind it through the same nine blur layers
		     and background-to-transparent gradient, so nothing but the pills is
		     opaque. Albums are not conversations, so the filters go with the tab
		     they act on rather than sitting inert above both. -->
		<div class="relative flex min-h-0 flex-1 flex-col">
			<!-- Selecting takes the row away rather than leaving it inert: the
			     selection bar covers the top of the screen while it is up, and a
			     dead row of pills there would only collect scrolling rows behind
			     it. -->
			{#if !selecting}
				<ProgressiveBlur
					data-fixed-header
					class="pointer-events-none absolute top-0 left-0 z-10 w-full"
					bgClass="bg-linear-to-b from-background to-transparent"
					contentClass="flex flex-col pt-3 pb-6"
					direction="topToBottom"
				>
					<ConversationsFilters
						filters={conversations.filters}
						locked={filtersLocked}
						onchange={(selection) =>
							conversations.setFilters(selection)}
						class="pointer-events-auto h-9 items-center px-screen"
					/>
				</ProgressiveBlur>
			{/if}
			<div
				bind:this={container}
				data-scroll-root
				data-slot="conversations-scroller"
				class={[
					"flex min-h-0 flex-1 flex-col gap-0 overflow-auto overscroll-contain px-0 pb-0",
					// pt-12 puts the first row at the pills' bottom edge
					// (pt-3 + h-9), not at the overlay's: the pb-6 below them
					// is blur tail, and rows are meant to fade out through it.
					{
						"pt-(--selection-bar-height)": selecting,
						"pt-12": !selecting,
					},
					className,
				]}
				onscroll={() =>
					(conversations.scrollY = container?.scrollTop ?? 0)}
			>
				{#if conversations.loading}
					{#each Array(8)}
						<ListRowSkeleton />
					{/each}
				{:else if conversations.error && visibleEntries.length === 0}
					<div class="flex flex-1">
						<ApiErrorDisplay
							error={conversations.error}
							onRetry={() => conversations.retry()}
							class="m-auto"
						/>
					</div>
				{:else}
					<div
						data-refresh-content
						class="min-h-overscrollable flex shrink-0 flex-col gap-0 pb-nav-clear"
					>
						{#if pinnedEntries.length > 0}
							<div
								class="flex items-center gap-1.5 px-screen pt-5.5 pb-2.5"
							>
								<PushPinIcon
									weight="fill"
									class="size-3 text-ink3"
								/>
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
						{/each}
						<ConversationsPagingTail
							paging={conversations.paging}
							hasMore={conversations.nextPage !== null}
							listEmpty={restEntries.length === 0 &&
								pinnedEntries.length === 0}
							filtered={conversations.filters.any}
						/>
					</div>
				{/if}
			</div>
			{#if !conversations.loading && (visibleEntries.length > 0 || !conversations.error)}
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
			{/if}
			<ScrollToTopButton {container} class="bottom-(--nav-clear)" />
		</div>
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
