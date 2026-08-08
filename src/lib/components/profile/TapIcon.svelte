<script lang="ts">
	import CookieIcon from "phosphor-svelte/lib/CookieIcon";
	import FireIcon from "phosphor-svelte/lib/FireIcon";
	import SmileyWinkIcon from "phosphor-svelte/lib/SmileyWinkIcon";

	import cookieEmoji from "$lib/assets/emojis/cookie/72px.png";
	import demonEmoji from "$lib/assets/emojis/demon/72px.png";
	import fireEmoji from "$lib/assets/emojis/fire/72px.png";
	import { TapType, tapTypes } from "$lib/model/interest/taps";
	// The default size has to be beatable: `class={["size-6", className]}` leaves
	// the winner to stylesheet order, which is why a caller asking for a smaller
	// emoji got a `size-6` one anyway.
	import { cn } from "$lib/util/utils";

	let {
		tapType,
		sent = false,
		class: className,
	}: {
		tapType: TapType;
		/**
		 * Whether this is a tap that exists — one sent or received — rather than
		 * one on offer. See the note below on why the two look different.
		 */
		sent?: boolean;
		class?: import("svelte/elements").ClassValue;
	} = $props();

	// A tap you could send is a control, so it takes the redesign's line
	// iconography and `currentColor` along with every other button. A tap that has
	// actually been sent or received is the emoji itself — it is the thing the
	// other person sees, it needs no accent behind it to read as done, and the
	// three types stay told apart by their own colors.
	const icons = {
		[TapType.Friendly]: CookieIcon,
		[TapType.Hot]: FireIcon,
		// Phosphor has no devil, and the set's other faces read as moods rather
		// than as an advance; the wink is the closest thing to 😈's meaning here.
		[TapType.Looking]: SmileyWinkIcon,
	};

	const emojis = {
		[TapType.Friendly]: cookieEmoji,
		[TapType.Hot]: fireEmoji,
		[TapType.Looking]: demonEmoji,
	};

	const Icon = $derived(icons[tapType]);
</script>

{#if sent}
	<img
		src={emojis[tapType]}
		alt={`${tapTypes[tapType]} tap`}
		width="24"
		height="24"
		class={cn("size-6 shrink-0", className)}
		draggable="false"
	/>
{:else}
	<Icon
		role="img"
		aria-label={`${tapTypes[tapType]} tap`}
		class={cn("size-6 shrink-0", className)}
	/>
{/if}
