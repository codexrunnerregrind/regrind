<script lang="ts">
	import StarIcon from "phosphor-svelte/lib/StarIcon";

	import {
		type ConversationFilterKey,
		type ConversationFilters,
		type ConversationFilterSelection,
	} from "$lib/chat/conversation-filters.svelte";
	import { ACTIVE_FILTER } from "$lib/components/filters/active-filter";
	import { Button } from "$lib/components/ui/button";
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

	// Favorites is the star everywhere else in the app, so it reads without a
	// word; the rest have no icon anyone would guess at, so they say what they
	// are. The star still carries an aria-label, being icon-only.
	const favorite = $derived(filters.active.includes("favorites"));
	const unread = $derived(filters.active.includes("unread"));
	const online = $derived(filters.active.includes("online"));
	const rightNow = $derived(filters.active.includes("rightNow"));

	function toggle(key: ConversationFilterKey) {
		onchange({
			active: filters.active.includes(key)
				? filters.active.filter((active) => active !== key)
				: [...filters.active, key],
		});
	}
</script>

<!-- The grid's quick filters in miniature — same pills, same inverted fill when
     on, same row that scrolls rather than wraps. Ordered by what a tap does
     rather than by the official app's order: the pills that toggle on the spot
     come first, then the two that carry a value of their own and open a sheet,
     so the row does not alternate between the two behaviours. -->
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
	<Button
		variant="secondary"
		aria-pressed={unread}
		onclick={() => toggle("unread")}
		class={{ [ACTIVE_FILTER]: unread }}
	>
		Unread
	</Button>
	<Button
		variant="secondary"
		aria-pressed={online}
		onclick={() => toggle("online")}
		class={{ [ACTIVE_FILTER]: online }}
	>
		Online
	</Button>
	<Button
		variant="secondary"
		aria-pressed={rightNow}
		onclick={() => toggle("rightNow")}
		class={{ [ACTIVE_FILTER]: rightNow }}
	>
		Right now
	</Button>
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
