<script lang="ts">
	import { tick, untrack } from "svelte";

	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import { Spinner } from "$lib/components/ui/spinner";
	import { hapticImpact } from "$lib/platform/haptics";
	import { getConversationState } from "../conversation-state.svelte";
	import ConversationError from "./ConversationError.svelte";
	import ConversationPaginationSentinel from "./ConversationPaginationSentinel.svelte";
	import MessagesList from "./MessagesList.svelte";
	import MessagesListSkeleton from "./MessagesListSkeleton.svelte";
	import ScrollToBottomButton from "./ScrollToBottomButton.svelte";

	const conversationState = $derived(getConversationState()());

	let container: HTMLDivElement | null = $state(null);
	let refreshControl: DataRefreshControl | undefined = $state();

	const FLOOR_SLOP_PX = 16;

	let atFloor = $state(true);
	let seenTimestamp = $state(0);

	$effect(() => {
		markReadMessagesEffect();
	});

	function markReadMessagesEffect(): void {
		if (!atFloor) return;
		const latest = conversationState.messages.reduce(
			(max, m) => Math.max(max, m.timestamp),
			0,
		);
		untrack(() => {
			if (latest > seenTimestamp) {
				seenTimestamp = latest;
			}
		});
	}

	function floorDistance() {
		if (!container) return 0;
		return (
			container.scrollHeight -
			container.clientHeight -
			container.scrollTop
		);
	}

	let scrollingToRest = false;
	let scrollingToRestTimer: ReturnType<typeof setTimeout> | null = null;

	async function scrollToRest(behavior: ScrollBehavior) {
		await tick();
		atFloor = true;
		if (behavior === "smooth") {
			scrollingToRest = true;
			if (scrollingToRestTimer !== null)
				clearTimeout(scrollingToRestTimer);
			scrollingToRestTimer = setTimeout(endScrollingToRest, 1500);
		}
		refreshControl?.scrollToRest(behavior);
		if (floorDistance() <= 1) endScrollingToRest();
	}

	function endScrollingToRest() {
		scrollingToRest = false;
		if (scrollingToRestTimer !== null) {
			clearTimeout(scrollingToRestTimer);
			scrollingToRestTimer = null;
		}
	}

	function onContainerScroll() {
		if (scrollingToRest) {
			if (floorDistance() <= 1) endScrollingToRest();
			return;
		}
		atFloor = floorDistance() <= FLOOR_SLOP_PX;
	}

	function onContainerScrollEnd() {
		endScrollingToRest();
		atFloor = floorDistance() <= FLOOR_SLOP_PX;
	}

	$effect(() => {
		return addInputEventsEffect();
	});

	function addInputEventsEffect() {
		const el = container;
		if (!el) return;
		el.addEventListener("wheel", endScrollingToRest, { passive: true });
		el.addEventListener("touchstart", endScrollingToRest, {
			passive: true,
		});
		return () => {
			el.removeEventListener("wheel", endScrollingToRest);
			el.removeEventListener("touchstart", endScrollingToRest);
		};
	}

	let scrollDone = false;
	let lastFirstId = "";

	$effect(() => {
		onConversationChangeEffect();
	});

	function onConversationChangeEffect(): void {
		void conversationState.conversationId;
		untrack(() => {
			scrollDone = false;
			lastFirstId = "";
			atFloor = true;
			seenTimestamp = 0;
			endScrollingToRest();
		});
	}

	$effect(() => {
		onConversationLoadedEffect();
	});

	function onConversationLoadedEffect(): void {
		if (!conversationState.loading && !scrollDone && container) {
			scrollDone = true;
			void scrollToRest("instant");
		}
	}

	$effect(() => {
		onNewMessageEffect();
	});

	function onNewMessageEffect(): void {
		const firstMessage = conversationState.messages.at(0);
		const firstId = firstMessage?.messageId ?? "";
		if (
			scrollDone &&
			firstMessage &&
			firstId &&
			firstId !== lastFirstId &&
			lastFirstId !== ""
		) {
			if (
				firstMessage.senderId === conversationState.ourProfileId ||
				untrack(() => atFloor)
			) {
				void scrollToRest("smooth");
			}
		}
		lastFirstId = firstId;
	}

	$effect(() => {
		return keepRestingOnResizeEffect();
	});

	/**
	 * The composer grows and shrinks under the list — a reply preview appearing,
	 * a message wrapping onto a third line — and every time it does, the list
	 * loses that much height from its bottom. Watching the list's own box rather
	 * than the composer's keeps the newest message resting on the floor no
	 * matter what changed size, and needs nothing measured to do it.
	 */
	function keepRestingOnResizeEffect() {
		const el = container;
		if (!el) return;
		const observer = new ResizeObserver(() => {
			untrack(() => {
				if (!atFloor) return;
				el.scrollTop = el.scrollHeight;
			});
		});
		observer.observe(el);
		return () => observer.disconnect();
	}
</script>

<div
	class="relative flex min-h-0 max-w-full flex-1 flex-col bg-chat-background"
>
	<div
		class="flex min-h-0 max-w-full flex-1 flex-col gap-1 overflow-auto overscroll-contain px-4.5 pt-20 pb-1.5 *:first:mt-auto"
		bind:this={container}
		style:overflow-anchor="none"
		onscroll={onContainerScroll}
		onscrollend={onContainerScrollEnd}
	>
		{#if conversationState.loading}
			{#key conversationState.conversationId}
				<MessagesListSkeleton />
			{/key}
		{:else if conversationState.error}
			<ConversationError />
		{:else}
			<div
				class="flex min-h-overscrollable shrink-0 flex-col justify-end gap-1"
			>
				<ConversationPaginationSentinel {container} />
				<MessagesList bind:seenTimestamp />
			</div>
		{/if}
	</div>
	<!-- Floated over the list rather than sitting above the oldest bubble: in the
	     flow it took ~124px the moment a fetch started and gave them back when it
	     finished, shoving the messages the reader is looking at down and up again
	     on every page. -->
	{#if conversationState.loadingMore}
		<Spinner
			class="absolute top-22 left-1/2 z-10 shrink-0 -translate-x-1/2"
		/>
	{/if}
	{#if !conversationState.loading && !conversationState.error}
		<DataRefreshControl
			bind:this={refreshControl}
			{container}
			updating={conversationState.refreshing}
			containerClass="bottom-0"
			hintOffset={8}
			position="bottom"
			onrefresh={() => {
				hapticImpact("light");
				void conversationState.refresh();
			}}
		/>
		{#if !atFloor}
			<ScrollToBottomButton
				{seenTimestamp}
				onclick={() => void scrollToRest("smooth")}
			/>
		{/if}
	{/if}
</div>
