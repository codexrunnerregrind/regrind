<script lang="ts">
	import { onNavigate } from "$app/navigation";
	import { untrack } from "svelte";
	import type { Attachment } from "svelte/attachments";

	import {
		STACK_Z,
		stackMotion,
	} from "$lib/components/navigation/stack/motion";
	import { trackScrolled } from "$lib/components/navigation/stack/snapshot";
	import { paneSurface } from "$lib/components/navigation/stack/surface";
	import { attachSystemBackGesture } from "$lib/platform/system-back-gesture";
	import { earlierPathnames } from "$lib/util/history";
	import { reducedMotion } from "$lib/util/reduced-motion";
	import { pushedFromChain } from "./hierarchy";
	import { PageStackState } from "./page-stack-state.svelte";

	let {
		scope,
		children,
		rootPane,
		rootElsewhere = false,
	}: {
		scope: string;
		children?: import("svelte").Snippet;
		/**
		 * The scope's root screen when something else shows it (the tab shell):
		 * this stack's own pane then stays out of the way, and a push snapshots
		 * that screen instead.
		 */
		rootPane?: () => HTMLElement | null;
		rootElsewhere?: boolean;
	} = $props();

	let pane: HTMLElement | null = $state(null);
	let dim: HTMLElement | null = $state(null);

	const motion = stackMotion();

	const stack: PageStackState = new PageStackState({
		surface: paneSurface({
			panes: () => {
				const ghost = stack.ghost?.node ?? null;
				return stack.liveRole === "front"
					? { front: pane, back: ghost, dim }
					: { front: ghost, back: pane, dim };
			},
			parallax: () => !reducedMotion.current,
			motion,
		}),
		motion,
		livePane: () => rootPane?.() ?? pane,
		reducedMotion: () => reducedMotion.current,
		scope: untrack(() => scope),
		pushedFrom: pushedFromChain({
			pathname: location.pathname,
			earlier: earlierPathnames(),
		}),
	});

	const liveZ = $derived(
		stack.liveRole === "front" ? STACK_Z.front : STACK_Z.back,
	);
	const ghostZ = $derived(
		stack.liveRole === "front" ? STACK_Z.back : STACK_Z.front,
	);

	const mountGhost: Attachment<HTMLElement> = (host) => {
		const snapshot = stack.ghost;
		if (!snapshot) return;
		snapshot.node.style.zIndex = ghostZ;
		// A root screen snapshotted from the tab shell is a pane in its pager,
		// not a fixed layer of its own.
		snapshot.node.style.position = "fixed";
		snapshot.node.style.inset = "0";
		snapshot.node.classList.add("bg-background");
		host.append(snapshot.node);
		return () => snapshot.node.remove();
	};

	onNavigate((navigation) => stack.navigate(navigation));

	$effect(() => attachSystemBackGesture(stack));
</script>

<div class="contents" {@attach mountGhost}>
	<div
		bind:this={pane}
		{@attach trackScrolled}
		data-slot="page-stack-pane"
		class={[
			"fixed inset-0 bg-background pt-(--safe-area-top) pb-(--content-pb)",
			{
				"shadow-(--stack-edge)": motion.edge,
				"pointer-events-none invisible": rootElsewhere,
			},
		]}
		style:z-index={liveZ}
	>
		{@render children?.()}
	</div>
	{#if stack.ghost}
		<div
			bind:this={dim}
			data-slot="page-stack-dim"
			class="pointer-events-none fixed inset-0 bg-[rgb(0_0_0/var(--stack-scrim))] opacity-0"
			style:z-index={STACK_Z.dim}
		></div>
	{/if}
</div>
