<script lang="ts">
	import { flushSync } from "svelte";

	import { stopScrollMomentum } from "#lib/platform/scroll-momentum.ts";
	import { observeIntersection } from "#lib/util/observe-intersection.ts";
	import { getConversationState } from "../conversation-state.svelte";
	import { holdReadingAnchor, readingAnchor } from "./reading-anchor";

	let { container }: { container: HTMLElement } = $props();

	const conversationState = $derived(getConversationState()());

	async function loadMore() {
		const state = conversationState;
		if (!container || state.loadingMore || state.pageKey === null) return;
		await state.loadMore({
			commit: async (apply) => {
				const scroller = container;
				if (conversationState !== state || !scroller) return apply();
				// iOS momentum overwrites the correction below.
				await stopScrollMomentum(scroller);
				keepReadingPosition({ scroller, apply });
			},
		});
	}

	function keepReadingPosition({
		scroller,
		apply,
	}: {
		scroller: HTMLElement;
		apply: () => void;
	}): void {
		const anchor = readingAnchor(scroller);
		apply();
		flushSync();
		holdReadingAnchor(scroller, anchor);
	}
</script>

{#key conversationState.pageKey}
	<div
		class="h-0"
		use:observeIntersection={{
			handle: conversationState.pageKey === null ? undefined : loadMore,
			rootMargin: "400px",
		}}
	></div>
{/key}
