<script lang="ts">
	import { flushSync } from "svelte";

	import { stopScrollMomentum } from "#lib/platform/scroll-momentum.ts";
	import { whenTapQuiet } from "#lib/platform/tap-quiet.ts";
	import { SETTLE_MS } from "#lib/util/load-when-visible.ts";
	import { observeIntersection } from "#lib/util/observe-intersection.ts";
	import { getConversationState } from "../conversation-state.svelte";
	import {
		holdReadingAnchor,
		nearTop,
		readingAnchor,
	} from "./reading-anchor";

	let { container }: { container: HTMLElement } = $props();

	const conversationState = $derived(getConversationState()());

	async function loadMore() {
		const state = conversationState;
		if (!container || state.loadingMore || state.pageKey === null) return;
		await state.loadMore({
			commit: async (apply) => {
				const scroller = container;
				if (conversationState !== state || !scroller) return apply();
				// iOS momentum overwrites the correction below, so a page
				// waits for the flick to end, or stops it near the top.
				const reachedTop = await restOrNearTop(scroller);
				if (conversationState !== state) return apply();
				if (reachedTop) await stopScrollMomentum(scroller);
				// A page of messages landing under a tap costs it its click.
				await whenTapQuiet();
				if (conversationState !== state) return apply();
				keepReadingPosition({ scroller, apply });
			},
		});
	}

	function restOrNearTop(scroller: HTMLElement): Promise<boolean> {
		return new Promise((resolve) => {
			let timer: ReturnType<typeof setTimeout> | undefined;
			const done = (near: boolean) => {
				clearTimeout(timer);
				scroller.removeEventListener("scroll", onScroll);
				resolve(near);
			};
			const wait = () => {
				clearTimeout(timer);
				timer = setTimeout(() => done(false), SETTLE_MS);
			};
			const onScroll = () => (nearTop(scroller) ? done(true) : wait());
			if (nearTop(scroller)) return done(true);
			scroller.addEventListener("scroll", onScroll, { passive: true });
			wait();
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
			// Far enough ahead that a flick rarely reaches unloaded history.
			rootMargin: "150%",
		}}
	></div>
{/key}
