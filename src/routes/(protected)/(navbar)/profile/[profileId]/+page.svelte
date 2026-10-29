<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { untrack } from "svelte";

	import {
		armProfileDeck,
		claimProfileDeck,
		type ProfileDeck,
	} from "$lib/profile/profile-deck";
	import ProfilePager from "./ProfilePager.svelte";

	let { data }: import("./$types").PageProps = $props();

	const ourProfileId = $derived(data.ourProfileId);
	const routeId = $derived(Number(page.params.profileId));
	const profileThumbHash = $derived(
		page.url.searchParams.get("profileThumbHash"),
	);

	/** The list this profile was opened from, or just this profile on its own. */
	function deckFor(profileId: number): ProfileDeck {
		const claimed = claimProfileDeck(profileId);
		return claimed?.ids.includes(profileId)
			? claimed
			: { ids: [profileId] };
	}

	const initialId = untrack(() => routeId);
	let deck = $state(deckFor(initialId));
	let activeId = $state(initialId);
	// The id we last put in the URL ourselves. A swipe rewrites the URL so
	// reloading or sharing lands on the profile actually being looked at, and
	// this keeps that rewrite from reading back as a navigation elsewhere.
	let ownUrlId = initialId;

	$effect(() => {
		const id = routeId;
		if (id === ownUrlId) return;
		untrack(() => {
			deck = deckFor(id);
			activeId = id;
		});
		ownUrlId = id;
	});

	// Handed straight back rather than consumed and dropped: a deck is claimed
	// once, and everything you can reach from a profile — a chat, an album, a
	// photo, somebody else's profile — comes back here afterwards, to a screen
	// that had nothing left to page through. Re-armed for the profile actually
	// being looked at, so it is still only ever claimed by that one profile and
	// opening anybody else starts a deck of one, as before.
	$effect(() => {
		if (deck.ids.length > 1) armProfileDeck(activeId, deck);
	});

	function onactive(profileId: number) {
		activeId = profileId;
		ownUrlId = profileId;
		// A real navigation rather than shallow routing. `replaceState` rewrites
		// the address bar but leaves `page.params` — and the entry the router
		// restores on the way back — pointing at the profile the screen was
		// opened on, so leaving for a chat or an album and coming back landed on
		// the wrong person. This route has no load of its own and the page
		// component is reused across the param change, so the navigation costs
		// nothing beyond keeping the history entry honest.
		goto(`/profile/${profileId}`, {
			replaceState: true,
			noScroll: true,
			keepFocus: true,
		}).catch((error) => console.error(error));
	}

	async function extend(): Promise<void> {
		const grow = deck.extend;
		if (!grow) return;
		const grown = await grow();
		// Only ever appended to. The originating list is live — it refreshes
		// itself, and profiles drop out of it — so what comes back can be shorter
		// than what is already being paged through, and swapping it in wholesale
		// would pull the ground out from under the pager mid-swipe.
		const known = new Set(deck.ids);
		const added = grown.filter((id) => !known.has(id));
		if (added.length === 0) return;
		deck = { ...deck, ids: [...deck.ids, ...added] };
	}
</script>

<ProfilePager
	ids={deck.ids}
	{activeId}
	{ourProfileId}
	{onactive}
	extend={deck.extend ? extend : undefined}
	{profileThumbHash}
/>
