<script lang="ts" module>
	// A mounted row's height, which placeholders take. Kept across remounts so a
	// list rebuilt at its saved scroll lays out as it was left.
	let rowHeight = $state(90);
</script>

<script lang="ts">
	import PushPinIcon from "phosphor-svelte/lib/PushPinIcon";
	import { onDestroy, tick, untrack } from "svelte";

	import { getConversations } from "$lib/chat/conversations-context.svelte";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import ListRowSkeleton from "$lib/components/feedback/ListRowSkeleton.svelte";
	import PagerTrack from "$lib/components/shared/PagerTrack.svelte";
	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import ScrollToTopButton from "$lib/components/shared/ScrollToTopButton.svelte";
	import UnderlineTabs from "$lib/components/shared/UnderlineTabs.svelte";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import { hapticImpact, hapticSelection } from "$lib/platform/haptics";
	import { below } from "$lib/util/breakpoints.svelte";
	import { leaveDeletedPages } from "$lib/util/deleted-pages";
	import { restoreScrollOnce } from "$lib/util/scroll-restore.svelte";
	import { SelectionSet } from "$lib/util/selection.svelte";
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
	const ROW_OVERSCAN = 3;
	const PLACEHOLDER = '[data-slot="conversation-placeholder"]';

	const conversations: ConversationsState = getConversations();
	const mobile = below("split");
	const visibleEntries = $derived(conversations.visibleEntries);
	const mountQueue = new MountQueue({ onDrained: () => (restoring = false) });

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
	const activeIndex = $derived(
		Math.max(
			0,
			tabs.findIndex((tab) => tab.value === activeTab),
		),
	);

	function selectTab(value: string) {
		if (value === activeTab) return;
		hapticSelection();
		conversations.activeTab = value as InboxTab;
	}

	// Where the pager is, for the underline to follow the finger.
	let position = $state(0);
	let gliding = $state(false);

	function swipedTo(target: number) {
		const landed = tabs[target];
		if (!landed) return;
		hapticSelection();
		conversations.activeTab = landed.value;
	}

	// The album grid can be hundreds of photos, so it exists only while Albums
	// is the tab on show or some of it is on screen mid-swipe.
	function albumsMounted(visible: boolean): boolean {
		return !covered && (activeTab === "albums" || visible);
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

	function confirmDelete() {
		hapticImpact("medium");
		exitSelection();
		leaveDeletedPages({
			pathnames: deleteIds.map((id) => `/chat/${id}`),
			parent: "/chat",
		});
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

	// Back from a profile the list mounts again at its saved scroll: the rows
	// on screen there mount at once instead of flashing as placeholders.
	const restoredRows = untrack(() => {
		const top = conversations.scrollY;
		if (top <= 0) return null;
		return {
			from:
				Math.floor(top / rowHeight) -
				pinnedEntries.length -
				ROW_OVERSCAN,
			to:
				Math.ceil((top + window.innerHeight) / rowHeight) +
				ROW_OVERSCAN,
		};
	});

	// WebKit's scroll anchoring shifts a restored list by a row while its
	// placeholders mount, so it is off until they have.
	let restoring = $state(restoredRows !== null);

	let content: HTMLDivElement | null = $state(null);

	$effect(() => {
		if (restoring && content && !content.querySelector(PLACEHOLDER))
			restoring = false;
	});

	$effect(() => {
		void visibleEntries;
		if (!content) return;
		const link = content.querySelector(
			':scope > :not(.pinned-group) a[href^="/chat/"]',
		);
		let row = link;
		while (row && row.parentElement !== content) row = row.parentElement;
		const height = row?.getBoundingClientRect().height;
		if (height) rowHeight = height;
	});

	function mountsEagerly(index: number): boolean {
		if (index < EAGER_COUNT) return true;
		return (
			restoredRows !== null &&
			index >= restoredRows.from &&
			index <= restoredRows.to
		);
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
	onConfirm={confirmDelete}
/>

<div class="relative flex h-full w-full min-w-list-rail flex-col">
	<div class="shrink-0 px-screen pt-4">
		<h1 class="screen-title">Inbox</h1>
		<UnderlineTabs
			{tabs}
			value={activeTab}
			onSelect={selectTab}
			position={covered ? null : position}
			{gliding}
			class="mt-4"
		/>
	</div>
	<!-- A flick past Albums carries on to the tab bar's next tab. Selecting
	     pins the pager to Messages. -->
	<PagerTrack
		data-slot="inbox-pager"
		class="min-h-0 flex-1"
		count={tabs.length}
		index={activeIndex}
		enabled={!selecting && !covered}
		onswipe={swipedTo}
		paneSlots={["inbox-pane-messages", "inbox-pane-albums"]}
		bind:position
		bind:gliding
	>
		{#snippet pane(index, { visible })}
			<!-- The row sits over the list rather than above it, as the grid's quick
			     filters do: rows scroll behind it through the same nine blur layers
			     and background-to-transparent gradient, so nothing but the pills is
			     opaque. Albums are not conversations, so the filters go with the tab
			     they act on rather than sitting inert above both. -->
			{#if index === 0}
				<div class="relative flex h-full min-h-0 w-full flex-col">
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
							"flex min-h-0 flex-1 flex-col gap-0 overflow-auto overscroll-y-contain px-0 pb-0",
							// pt-12 puts the first row at the pills' bottom edge
							// (pt-3 + h-9), not at the overlay's: the pb-6 below them
							// is blur tail, and rows are meant to fade out through it.
							{
								"pt-(--selection-bar-height)": selecting,
								"pt-12": !selecting,
								"[overflow-anchor:none]": restoring,
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
								bind:this={content}
								data-refresh-content
								style:--conversation-row-height="{rowHeight}px"
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
										<span class="section-label">Pinned</span
										>
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
									{@render row(
										conversation,
										mountsEagerly(i),
									)}
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
					<ScrollToTopButton
						{container}
						class="bottom-(--nav-clear)"
					/>
				</div>
			{:else if albumsMounted(visible)}
				<div class="relative flex h-full min-h-0 w-full flex-col">
					<AlbumsTab class={className} />
				</div>
			{/if}
		{/snippet}
	</PagerTrack>
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
