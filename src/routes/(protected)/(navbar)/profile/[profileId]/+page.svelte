<script lang="ts">
	import { replaceState } from "$app/navigation";
	import { page } from "$app/state";
	import { untrack } from "svelte";

	import {
		claimProfileDeck,
		type ProfileDeck,
	} from "$lib/profile/profile-deck";
	import ProfilePager from "./ProfilePager.svelte";

	let { data }: import("./$types").PageProps = $props();

	const ourProfileId = $derived(data.ourProfileId);
	const routeId = $derived(Number(page.params.profileId));

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

	function onactive(profileId: number) {
		activeId = profileId;
		ownUrlId = profileId;
		replaceState(`/profile/${profileId}`, page.state);
	}

	async function extend(): Promise<void> {
		const grow = deck.extend;
		if (!grow) return;
		const ids = await grow();
		deck = { ...deck, ids };
	}
</script>

<ProfilePager
	ids={deck.ids}
	{activeId}
	{ourProfileId}
	{onactive}
	extend={deck.extend ? extend : undefined}
/>
