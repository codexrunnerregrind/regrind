<script lang="ts">
	import CaretUpIcon from "phosphor-svelte/lib/CaretUpIcon";

	import { cn } from "$lib/util/utils";
	import ScrollJumpButton from "./ScrollJumpButton.svelte";

	let {
		container,
		class: className,
	}: {
		container: HTMLElement | null;
		class?: import("svelte/elements").ClassValue;
	} = $props();

	const TOP_SLOP_PX = 16;
	const DIRECTION_SLOP_PX = 4;
	const GLIDE_TIMEOUT_MS = 1500;

	let visible = $state(false);
	let lastTop = 0;
	let gliding = false;
	let glideTimer: ReturnType<typeof setTimeout> | undefined;

	function releaseGlide() {
		gliding = false;
		clearTimeout(glideTimer);
	}

	function atTop(el: HTMLElement) {
		return el.scrollTop <= TOP_SLOP_PX;
	}

	$effect(() => {
		const el = container;
		if (!el) return;

		const onScroll = () => {
			const top = el.scrollTop;
			const delta = top - lastTop;

			if (gliding) {
				if (top <= 1) {
					releaseGlide();
					visible = false;
					lastTop = top;
				}
				return;
			}

			if (atTop(el)) visible = false;
			else if (delta <= -DIRECTION_SLOP_PX) visible = true;
			else if (delta >= DIRECTION_SLOP_PX) visible = false;
			else return;

			lastTop = top;
		};

		const onScrollEnd = () => {
			releaseGlide();
			if (atTop(el)) visible = false;
			lastTop = el.scrollTop;
		};

		lastTop = el.scrollTop;
		if (atTop(el)) visible = false;
		el.addEventListener("scroll", onScroll, { passive: true });
		el.addEventListener("scrollend", onScrollEnd, { passive: true });
		el.addEventListener("wheel", releaseGlide, { passive: true });
		el.addEventListener("touchstart", releaseGlide, { passive: true });
		return () => {
			el.removeEventListener("scroll", onScroll);
			el.removeEventListener("scrollend", onScrollEnd);
			el.removeEventListener("wheel", releaseGlide);
			el.removeEventListener("touchstart", releaseGlide);
			releaseGlide();
		};
	});

	function scrollToTop() {
		const el = container;
		if (!el) return;
		visible = false;
		gliding = true;
		clearTimeout(glideTimer);
		glideTimer = setTimeout(() => {
			releaseGlide();
			lastTop = el.scrollTop;
		}, GLIDE_TIMEOUT_MS);
		el.scrollTop = Math.min(el.scrollTop, el.clientHeight);
		lastTop = el.scrollTop;
		el.scroll({ top: 0, behavior: "smooth" });
	}
</script>

{#if visible}
	<ScrollJumpButton
		label="Scroll to top"
		class={cn("absolute inset-x-0 z-10 mx-auto w-fit", className)}
		onclick={scrollToTop}
	>
		<CaretUpIcon />
	</ScrollJumpButton>
{/if}
