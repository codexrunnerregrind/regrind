<script lang="ts">
	import LockSimpleIcon from "phosphor-svelte/lib/LockSimpleIcon";
	import PencilSimpleIcon from "phosphor-svelte/lib/PencilSimpleIcon";
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";

	import { Button } from "$lib/components/ui/button";
	import { myRightNowPost } from "$lib/right-now/my-post-state.svelte";
	import { postTimeLeft } from "$lib/right-now/post-expiry";
	import { getNow } from "$lib/util/now";
	import MyPostSheet from "./MyPostSheet.svelte";

	let open = $state(false);

	// Handed to the sheet, which morphs this pill into its own panel.
	let pill = $state<HTMLElement | null>(null);

	// The post that is already up can always be edited: the allowance is spent on
	// putting one up, not on changing it.
	const locked = $derived(!myRightNowPost.allowed && !myRightNowPost.hasPost);

	// On the button itself, so the countdown is readable without opening anything.
	// Ticks on the shared clock rather than one of its own.
	const timeLeft = $derived(
		postTimeLeft({
			expiration: myRightNowPost.post?.expiration,
			nowMs: getNow(),
		}),
	);

	// After mount, so the first fetch never lands mid-render.
	onMount(() => myRightNowPost.ensureLoaded());

	// The post's hour runs out while the screen is just sitting there, and the
	// allowance it spent comes back with it.
	$effect(() => {
		if (myRightNowPost.lapsed) myRightNowPost.lapse();
	});
</script>

<!-- A labelled pill in the corner rather than a bare icon, per the Right Now
     mock: "Post" says what it does, and the same button becomes "Edit post" once
     one is up. Over the feed rather than in it — the feed scrolls, and the way to
     your own post should be in the same place wherever you are in it. Shown
     locked rather than hidden when there is no allowance left; a missing button
     reads as a missing feature. Ending a post lives inside the sheet.

     No text-size utility in the class list: Button merges what it is given
     through tailwind-merge, which reads a custom `text-row` as a text *color*
     and drops the variant's own `text-primary-foreground` with it — which left
     the label inheriting near-white on a yellow pill.

     The icon's box carries ~3px of its own whitespace on each side, so the left
     padding and the gap are both a notch tighter than they measure: it takes
     that much to put the same visible space on either side of the content and
     keep the icon reading as part of the label rather than beside it.

     Opening morphs this pill into the sheet's panel and back — see
     post-morph.ts, which hides the pill for as long as its stand-in is up. -->
<div
	class="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-end px-4 pb-nav-clear"
>
	<Button
		size="lg"
		bind:ref={pill}
		class="pointer-events-auto h-auto min-h-12 gap-1 rounded-full py-2.5 pr-5 pl-4 font-semibold shadow-lg"
		aria-hidden={open}
		tabindex={open ? -1 : 0}
		onclick={() => {
			if (locked) {
				toast("You have no Right Now posts left for now");
				return;
			}
			open = true;
		}}
	>
		{#if myRightNowPost.hasPost}
			<PencilSimpleIcon weight="fill" class="size-4.5" />
			<!-- Two lines: what the button does, and the one thing you would have
			     opened it to find out. -->
			<span class="flex flex-col items-start leading-tight">
				Edit post
				{#if timeLeft !== null}
					<span class="text-xs font-medium opacity-75">
						{timeLeft}
					</span>
				{/if}
			</span>
		{:else}
			{#if locked}
				<LockSimpleIcon weight="fill" class="size-4.5" />
			{:else}
				<PlusIcon weight="bold" class="size-4.5" />
			{/if}
			<!-- The allowance in the same place the countdown goes, so the button
			     answers "can I?" as well as "what does it do?". Held back until it
			     is the API's answer rather than the zero it starts on, which would
			     read as a spent allowance for as long as the fetch takes. -->
			<span class="flex flex-col items-start leading-tight">
				Post
				{#if myRightNowPost.loaded}
					<span class="text-xs font-medium opacity-75">
						{myRightNowPost.remaining} left
					</span>
				{/if}
			</span>
		{/if}
	</Button>
</div>

<MyPostSheet bind:open {pill} />
