<script lang="ts">
	import { Portal } from "bits-ui";
	import { backOut, cubicIn } from "svelte/easing";
	import { prefersReducedMotion } from "svelte/motion";

	import { httpStatusOf } from "$lib/api/api-error";
	import { showErrorToast } from "$lib/api/error-toast";
	import { findSentTap, sendTap } from "$lib/api/interest/taps";
	import TapIcon from "$lib/components/profile/TapIcon.svelte";
	import Button from "$lib/components/ui/button/button.svelte";
	import { playHaptic } from "$lib/haptics";
	import { TapType, tapTypes } from "$lib/model/interest/taps";
	import { longPressHandlers } from "$lib/util/long-press";

	let {
		profileId,
		tapType,
		onTap,
	}: {
		profileId: number;
		tapType: TapType | null;
		onTap: (tapType: TapType | null) => void;
	} = $props();

	let root: HTMLDivElement | null = $state(null);
	let open = $state(false);
	let sending = $state(false);

	async function send(reaction: TapType) {
		open = false;
		if (sending || tapType !== null) return;
		sending = true;
		try {
			onTap(reaction);
			await sendTap({ recipientId: profileId, tapType: reaction });
		} catch (error) {
			// 400 means we already tapped them, maybe from another client.
			if (httpStatusOf(error) === 400) {
				const existing = await findSentTap(profileId).catch(
					() => undefined,
				);
				if (existing) {
					onTap(existing.tapType ?? reaction);
					return;
				}
			}
			console.error(error);
			showErrorToast({ label: "Failed to send tap", error });
			onTap(null);
		} finally {
			sending = false;
		}
	}

	const defaultTapType = TapType.Hot;

	const sent = $derived(tapType !== null);

	// Bubble centers relative to the button's, in px, fanned up and to the left
	// like the official app.
	const OPTIONS = [
		{ tapType: TapType.Friendly, x: -104, y: -36 },
		{ tapType: TapType.Hot, x: -58, y: -94 },
		{ tapType: TapType.Looking, x: 14, y: -110 },
	];
	const BUBBLE_RADIUS = 28;
	const EDGE_GAP = 8;
	// A finger this close to a bubble's center selects it.
	const SELECT_RADIUS = 40;

	let origin = $state({ x: 0, y: 0 });
	let options = $state(OPTIONS);
	let selected: TapType | null = $state(null);

	function openMenu() {
		if (sent || sending || !root) return;
		const rect = root.getBoundingClientRect();
		origin = {
			x: rect.left + rect.width / 2,
			y: rect.top + rect.height / 2,
		};
		// Pull the fan left when the button sits too close to the edge for it.
		const maxX = Math.max(...OPTIONS.map((option) => option.x));
		const shift = Math.max(
			0,
			origin.x + maxX + BUBBLE_RADIUS + EDGE_GAP - window.innerWidth,
		);
		options = OPTIONS.map((option) => ({ ...option, x: option.x - shift }));
		selected = null;
		open = true;
	}

	function optionAt(x: number, y: number): TapType | null {
		const hit = options.find(
			(option) =>
				Math.hypot(origin.x + option.x - x, origin.y + option.y - y) <
				SELECT_RADIUS,
		);
		return hit?.tapType ?? null;
	}

	// Grows each bubble out from under the button, like a FAB menu. Global, or
	// it would not play when the `{#if open}` around the list opens.
	function expand(
		_node: Element,
		{
			x,
			y,
			index,
			out,
		}: { x: number; y: number; index: number; out?: boolean },
	) {
		return {
			delay: out ? 0 : index * 35,
			duration: prefersReducedMotion.current ? 0 : out ? 150 : 300,
			easing: out ? cubicIn : backOut,
			css: (t: number) => `
				translate: calc(-50% + ${x * t}px) calc(-50% + ${y * t}px);
				scale: ${0.3 + 0.7 * t};`,
		};
	}

	$effect(() => {
		if (!open) return;
		// The finger that opened the menu is still down: sliding it onto a bubble
		// selects it, and lifting it there sends it.
		const onMove = (event: PointerEvent) => {
			const next = optionAt(event.clientX, event.clientY);
			if (
				next !== selected &&
				next !== null &&
				event.pointerType !== "mouse"
			)
				playHaptic("threshold");
			selected = next;
		};
		const onUp = (event: PointerEvent) => {
			const hit = optionAt(event.clientX, event.clientY);
			if (hit !== null) void send(hit);
		};
		const onDown = (event: PointerEvent) => {
			if (optionAt(event.clientX, event.clientY) === null) open = false;
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") open = false;
		};
		document.addEventListener("pointermove", onMove, true);
		document.addEventListener("pointerup", onUp, true);
		document.addEventListener("pointerdown", onDown, true);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("pointermove", onMove, true);
			document.removeEventListener("pointerup", onUp, true);
			document.removeEventListener("pointerdown", onDown, true);
			document.removeEventListener("keydown", onKey);
		};
	});
</script>

<!-- The round action beside the field, on the media viewer's 44pt circle. The
     circle stays muted throughout — the glyph alone carries the state, going from
     a line icon (a tap you can send) to the emoji itself (the tap they got). No
     accent fill: this is a thing that happened, not the screen's primary action,
     and the emoji is already the more legible of the two. -->
<div class="shrink-0" bind:this={root}>
	<Button
		size="icon"
		variant="secondary"
		aria-label={tapType === null
			? `Send a ${tapTypes[defaultTapType]} tap`
			: `${tapTypes[tapType]} tap sent`}
		aria-haspopup="menu"
		aria-expanded={open}
		{...longPressHandlers(openMenu)}
		onclick={() => send(defaultTapType)}
		disabled={sent || sending}
		class={[
			"size-11 touch-none rounded-full",
			{ "disabled:opacity-100": sent },
		]}
	>
		{#if tapType === null}
			<TapIcon tapType={defaultTapType} />
		{:else}
			<TapIcon {tapType} sent />
		{/if}
	</Button>
</div>
{#if open}
	<Portal>
		<div
			role="menu"
			aria-label="Tap type"
			class="fixed z-50 size-0"
			style:left="{origin.x}px"
			style:top="{origin.y}px"
		>
			{#each options as option, index (option.tapType)}
				<button
					type="button"
					role="menuitem"
					aria-label="Send a {tapTypes[option.tapType]} tap"
					data-selected={selected === option.tapType || undefined}
					class="absolute top-0 left-0 flex size-14 items-center justify-center rounded-full bg-secondary shadow-lg transition-[background-color,scale] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring data-selected:scale-115 data-selected:bg-muted-foreground/40"
					style:translate="calc(-50% + {option.x}px) calc(-50% + {option.y}px)"
					onclick={() => send(option.tapType)}
					in:expand|global={{ ...option, index }}
					out:expand|global={{ ...option, index, out: true }}
				>
					<TapIcon tapType={option.tapType} sent class="size-8" />
				</button>
			{/each}
			<!-- The button again, above the bubbles, so they come out from under it. -->
			<div
				aria-hidden="true"
				class="pointer-events-none absolute top-0 left-0 flex size-11 -translate-1/2 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
			>
				<TapIcon tapType={defaultTapType} />
			</div>
		</div>
	</Portal>
{/if}
