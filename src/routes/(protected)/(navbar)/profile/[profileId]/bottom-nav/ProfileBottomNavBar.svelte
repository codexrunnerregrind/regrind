<script lang="ts">
	import { isFloatingNav } from "$lib/platform/nav-style.svelte";
	import type { TapType } from "$lib/model/interest/taps";
	import OpenConversationButton from "./OpenConversationButton.svelte";
	import TapProfileButton from "./TapProfileButton.svelte";

	let {
		ourProfileId,
		profileId,
		tapType,
		onTap,
	}: {
		ourProfileId: number;
		profileId: number;
		tapType: TapType | null;
		onTap: (tapType: TapType | null) => void;
	} = $props();

	const isOurProfile = $derived(profileId === ourProfileId);

	// The docked tab bar paints the band under this composer. The floating one
	// does not — it hovers over the profile — so the composer has to reach the
	// bottom of the screen itself, or the photo scrolls through the gap between
	// the two.
	const floatingNav = $derived(isFloatingNav());
</script>

{#if !isOurProfile}
	<!-- The same bar the media viewer replies with (MediaViewerChrome.svelte): a
	     pill field and a 44pt round action beside it, on the screen background and
	     separated by a hairline, sitting directly on top of the tab bar.

	     Viewport-fixed, and the pager renders it outside its sliding track so it
	     stays that way: inside the track it took the track's transform as its
	     containing block, and the panes' composited scrollers painted over it. -->
	<div
		class={[
			"fixed left-0 z-20 w-full border-t border-border bg-background px-screen pt-3.5",
			{
				// The band the capsule floats in is filled by this bar instead of the
				// tab bar, plus 10pt so the field keeps a gap to the capsule: the
				// capsule only leaves 2pt of the band above itself, where the docked
				// bar left the whole 14pt.
				"bottom-0 pb-[calc(var(--safe-area-bottom)+var(--nav-height)+0.625rem)]":
					floatingNav,
				"bottom-[calc(var(--safe-area-bottom)+var(--nav-height))] pb-3.5":
					!floatingNav,
			},
		]}
	>
		<nav class="flex w-full flex-row items-center gap-2.5">
			<OpenConversationButton {profileId} {ourProfileId} />
			<TapProfileButton {profileId} {tapType} {onTap} />
		</nav>
	</div>
{/if}
