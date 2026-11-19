<script lang="ts">
	import CaretUpIcon from "phosphor-svelte/lib/CaretUpIcon";

	import { t } from "#lib/i18n/index.ts";
	import { answerStatusBarTaps } from "#lib/platform/status-bar-tap.ts";
	import {
		glidingToTop,
		jumpThenGlideToTop,
		stopGlidingToTop,
		TOP_SLOP_PX,
	} from "#lib/util/scroll.ts";
	import { cn } from "#lib/util/utils.ts";
	import ScrollJumpButton from "./ScrollJumpButton.svelte";

	let {
		container,
		text,
		onjump,
		labeled = $bindable(false),
		class: className,
	}: {
		container: HTMLElement | null;
		text?: string;
		onjump?: () => void;
		labeled?: boolean;
		class?: import("svelte/elements").ClassValue;
	} = $props();

	const DIRECTION_SLOP_PX = 4;

	let visible = $state(false);
	let lastTop = 0;

	function atTop(el: HTMLElement) {
		return el.scrollTop <= TOP_SLOP_PX;
	}

	$effect(() => {
		const el = container;
		if (!el) return;

		const onScroll = () => {
			const top = el.scrollTop;
			const delta = top - lastTop;

			if (glidingToTop(el)) {
				lastTop = top;
				return;
			}

			if (atTop(el)) visible = false;
			else if (delta <= -DIRECTION_SLOP_PX) visible = true;
			else if (delta >= DIRECTION_SLOP_PX) visible = false;
			else return;

			lastTop = top;
		};

		const onScrollEnd = () => {
			if (glidingToTop(el)) return;
			if (atTop(el)) visible = false;
			lastTop = el.scrollTop;
		};

		lastTop = el.scrollTop;
		if (atTop(el)) visible = false;
		el.addEventListener("scroll", onScroll, { passive: true });
		el.addEventListener("scrollend", onScrollEnd, { passive: true });
		const stopAnswering = answerStatusBarTaps({
			scroller: el,
			scrollToTop,
		});
		return () => {
			el.removeEventListener("scroll", onScroll);
			el.removeEventListener("scrollend", onScrollEnd);
			stopAnswering?.();
			stopGlidingToTop(el);
		};
	});

	$effect.pre(() => {
		if (visible) labeled = text !== undefined;
	});

	function scrollToTop() {
		const el = container;
		if (!el) return;
		visible = false;
		lastTop = 0;
		onjump?.();
		jumpThenGlideToTop({ element: el });
	}
</script>

{#if visible}
	<ScrollJumpButton
		label={text === undefined
			? t("shell.scrollToTopButton.a11y.label")
			: t("shell.scrollToTopButton.a11y.labelWithText", { text })}
		size={labeled ? "lg" : "icon-lg"}
		class={cn("absolute inset-x-0 z-10 mx-auto w-fit", className)}
		onclick={scrollToTop}
		onoutroend={() => (labeled = false)}
	>
		<CaretUpIcon />
		{#if text !== undefined}
			{text}
		{/if}
	</ScrollJumpButton>
{/if}
