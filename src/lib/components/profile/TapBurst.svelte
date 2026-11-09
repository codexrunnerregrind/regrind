<script lang="ts" module>
	export const TAP_BURST_MS = 900;
</script>

<script lang="ts">
	import { Portal } from "bits-ui";

	import TapIcon from "#lib/components/profile/TapIcon.svelte";
	import type { TapType } from "#lib/model/interest/taps.ts";

	let {
		tapType,
		x,
		y,
		pop = false,
		inline = false,
	}: {
		tapType: TapType;
		x: number;
		y: number;
		/** Also springs a large emoji up at the center. */
		pop?: boolean;
		/** Render in place, e.g. inside a modal dialog's top layer. */
		inline?: boolean;
	} = $props();

	type Particle = {
		dx: number;
		dy: number;
		rotate: number;
		size: number;
		delay: number;
	};

	const BURST_SIZE = 6;

	// Upward fan, from up-left to up-right.
	const particles: Particle[] = Array.from({ length: BURST_SIZE }, (_, i) => {
		const angle =
			(-150 + (120 * (i + Math.random() * 0.6)) / BURST_SIZE) *
			(Math.PI / 180);
		const distance = 55 + Math.random() * 40;
		return {
			dx: Math.cos(angle) * distance,
			dy: Math.sin(angle) * distance,
			rotate: (Math.random() - 0.5) * 60,
			size: 16 + Math.random() * 10,
			delay: Math.random() * 90,
		};
	});

	function fly(particle: Particle) {
		return (node: HTMLElement) => {
			// jsdom has no Web Animations.
			node.animate?.(
				[
					{
						transform: "translate(-50%, -50%) scale(0.4)",
						opacity: 1,
					},
					{ opacity: 1, offset: 0.5 },
					{
						transform: `translate(-50%, -50%) translate(${particle.dx}px, ${particle.dy}px) scale(1) rotate(${particle.rotate}deg)`,
						opacity: 0,
					},
				],
				{
					duration: TAP_BURST_MS - 200,
					delay: particle.delay,
					easing: "cubic-bezier(0.2, 0.7, 0.3, 1)",
					fill: "both",
				},
			);
		};
	}

	function spring(node: HTMLElement) {
		node.animate?.(
			[
				{
					transform:
						"translate(-50%, -50%) scale(0.2) rotate(-25deg)",
					opacity: 0,
				},
				{
					transform: "translate(-50%, -50%) scale(1.15) rotate(6deg)",
					opacity: 1,
					offset: 0.35,
				},
				{
					transform: "translate(-50%, -50%) scale(1) rotate(0deg)",
					opacity: 1,
					offset: 0.7,
				},
				{ transform: "translate(-50%, -80%) scale(1)", opacity: 0 },
			],
			{ duration: TAP_BURST_MS, easing: "ease-out", fill: "both" },
		);
	}
</script>

<Portal disabled={inline}>
	<div
		aria-hidden="true"
		class="pointer-events-none fixed z-50 size-0"
		style:left="{x}px"
		style:top="{y}px"
	>
		{#if pop}
			<span class="absolute top-0 left-0 flex size-16" {@attach spring}>
				<TapIcon {tapType} sent class="size-full drop-shadow-lg" />
			</span>
		{/if}
		{#each particles as particle, i (i)}
			<span
				class="absolute top-0 left-0 flex"
				style:width="{particle.size}px"
				style:height="{particle.size}px"
				{@attach fly(particle)}
			>
				<TapIcon {tapType} sent class="size-full" />
			</span>
		{/each}
	</div>
</Portal>
