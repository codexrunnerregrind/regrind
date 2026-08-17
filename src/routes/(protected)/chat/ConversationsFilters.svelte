<script lang="ts">
	import StarIcon from "phosphor-svelte/lib/StarIcon";

	import {
		CONVERSATION_FILTER_KEYS,
		type ConversationFilterKey,
		type ConversationFilters,
	} from "$lib/chat/conversation-filters.svelte";
	import { ACTIVE_FILTER_PRESSED } from "$lib/components/filters/active-filter";
	import { buttonVariants } from "$lib/components/ui/button";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";

	let {
		filters,
		onchange,
		inert = false,
		class: className,
	}: {
		filters: ConversationFilters;
		onchange: (active: ConversationFilterKey[]) => void;
		inert?: boolean;
		class?: import("svelte/elements").ClassValue;
	} = $props();

	// Favorites is the star everywhere else in the app, so it reads without a
	// word; the other two have no icon anyone would guess at, so they say what
	// they are. The star still carries an aria-label, being icon-only.
	const labels: Record<ConversationFilterKey, string> = {
		favorites: "Favorites",
		unread: "Unread",
		online: "Online",
	};
</script>

<!-- The grid's quick filters in miniature — same pill, same inverted fill when
     on, same row that scrolls rather than wraps. -->
<div class={["scrollbar-thin flex gap-0.5 overflow-x-auto", className]} {inert}>
	<ToggleGroup.Root
		type="multiple"
		variant="default"
		size="sm"
		class="h-9 gap-0.5"
		bind:value={
			() => filters.active,
			(values: string[]) =>
				onchange(
					CONVERSATION_FILTER_KEYS.filter((key) =>
						values.includes(key),
					),
				)
		}
	>
		{#each CONVERSATION_FILTER_KEYS as key (key)}
			<ToggleGroup.Item
				value={key}
				aria-label={key === "favorites" ? labels[key] : undefined}
				class={[
					buttonVariants({ variant: "secondary" }),
					ACTIVE_FILTER_PRESSED,
				]}
			>
				{#if key === "favorites"}
					<StarIcon
						weight={filters.active.includes(key)
							? "fill"
							: "regular"}
					/>
				{:else}
					{labels[key]}
				{/if}
			</ToggleGroup.Item>
		{/each}
	</ToggleGroup.Root>
</div>
