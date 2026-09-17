<script lang="ts">
	import StarIcon from "phosphor-svelte/lib/StarIcon";

	import {
		type ConversationFilterKey,
		type ConversationFilters,
		type ConversationFilterSelection,
	} from "$lib/chat/conversation-filters.svelte";
	import {
		ACTIVE_FILTER,
		ACTIVE_FILTER_PRESSED,
	} from "$lib/components/filters/active-filter";
	import { Button, buttonVariants } from "$lib/components/ui/button";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import InboxDistanceFilter from "./InboxDistanceFilter.svelte";
	import InboxPositionFilter from "./InboxPositionFilter.svelte";

	let {
		filters,
		onchange,
		class: className,
	}: {
		filters: ConversationFilters;
		onchange: (selection: Partial<ConversationFilterSelection>) => void;
		class?: import("svelte/elements").ClassValue;
	} = $props();

	let open = $state({ distance: false, position: false });

	// The three that toggle on the spot, as one segmented group.
	const TOGGLE_FILTER_KEYS = ["unread", "online", "rightNow"] as const;

	const TOGGLE_FILTER_LABELS: Record<
		(typeof TOGGLE_FILTER_KEYS)[number],
		string
	> = { unread: "Unread", online: "Online", rightNow: "Right now" };

	// Favorites is the star everywhere else in the app, so it reads without a
	// word; the rest have no icon anyone would guess at, so they say what they
	// are. The star still carries an aria-label, being icon-only.
	const favorite = $derived(filters.active.includes("favorites"));

	function toggle(key: ConversationFilterKey) {
		onchange({
			active: filters.active.includes(key)
				? filters.active.filter((active) => active !== key)
				: [...filters.active, key],
		});
	}
</script>

<!-- The grid's quick filters in miniature — same pills, same inverted fill when
     on, same row that scrolls rather than wraps, and the same toggle group
     holding the pills that switch on the spot. Then come the two that carry a
     value of their own and open a sheet, so the row does not alternate between
     the two behaviours. -->
<div class={["scrollbar-thin flex gap-0.5 overflow-x-auto", className]}>
	<Button
		variant="secondary"
		aria-label="Favorites"
		aria-pressed={favorite}
		onclick={() => toggle("favorites")}
		class={{ [ACTIVE_FILTER]: favorite }}
	>
		<StarIcon weight={favorite ? "fill" : "regular"} />
	</Button>
	<ToggleGroup.Root
		type="multiple"
		variant="default"
		bind:value={
			() =>
				TOGGLE_FILTER_KEYS.filter((key) =>
					filters.active.includes(key),
				),
			(values: (typeof TOGGLE_FILTER_KEYS)[number][]) => {
				onchange({
					active: [
						...filters.active.filter(
							(key) =>
								!(
									TOGGLE_FILTER_KEYS as readonly ConversationFilterKey[]
								).includes(key),
						),
						...values,
					],
				});
			}
		}
		size="sm"
		class="h-9"
	>
		{#each TOGGLE_FILTER_KEYS as key (key)}
			<ToggleGroup.Item
				value={key}
				class={[
					buttonVariants({ variant: "secondary" }),
					ACTIVE_FILTER_PRESSED,
				]}
			>
				{TOGGLE_FILTER_LABELS[key]}
			</ToggleGroup.Item>
		{/each}
	</ToggleGroup.Root>
	<Button
		variant="secondary"
		onclick={() => (open.distance = true)}
		class={{ [ACTIVE_FILTER]: filters.distanceMetres !== null }}
	>
		Distance
	</Button>
	<Button
		variant="secondary"
		onclick={() => (open.position = true)}
		class={{ [ACTIVE_FILTER]: filters.positions.length > 0 }}
	>
		Position
	</Button>
</div>

<InboxDistanceFilter
	bind:open={open.distance}
	distanceMetres={filters.distanceMetres}
	onapply={(distanceMetres) => onchange({ distanceMetres })}
/>
<InboxPositionFilter
	bind:open={open.position}
	positions={filters.positions}
	onapply={(positions) => onchange({ positions })}
/>
