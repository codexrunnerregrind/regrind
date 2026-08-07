<script lang="ts">
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
</script>

{#if !isOurProfile}
	<!-- The same bar the media viewer replies with (MediaViewerChrome.svelte): a
	     pill field and a 44pt round action beside it, on the screen background and
	     separated by a hairline, sitting directly on top of the tab bar. -->
	<div
		class="fixed bottom-[calc(var(--safe-area-bottom)+var(--nav-height))] left-0 z-20 w-full border-t border-border bg-background px-screen py-3.5"
	>
		<nav class="flex w-full flex-row items-center gap-2.5">
			<OpenConversationButton {profileId} {ourProfileId} />
			<TapProfileButton {profileId} {tapType} {onTap} />
		</nav>
	</div>
{/if}
