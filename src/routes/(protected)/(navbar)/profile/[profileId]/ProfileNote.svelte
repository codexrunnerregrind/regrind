<script lang="ts">
	import { NotePencilIcon } from "phosphor-svelte";

	import {
		ensureFavoriteNote,
		favoriteNote,
	} from "$lib/api/users/favorite-notes-state.svelte";
	import { Button } from "$lib/components/ui/button";
	import ProfileNoteEditor from "./ProfileNoteEditor.svelte";

	let { profileId, isFavorite }: { profileId: number; isFavorite: boolean } =
		$props();

	// Notes hang off a favorite, so there is nothing to read or write until the
	// profile is one.
	$effect(() => {
		if (!isFavorite) return;
		void ensureFavoriteNote(profileId);
	});

	const note = $derived(favoriteNote(profileId));
	const noteText = $derived(note?.notes.trim() ?? "");

	let open = $state(false);
</script>

{#if isFavorite}
	<!-- Top-right corner of the photo, like the official app. No safe-area
	     offset: the screen's own layout already clears the status bar, the same
	     way the actions overlaid on the photo's bottom edge do. Capped at half
	     the width so a long note stays one trimmed line rather than a banner
	     across the picture — `shrink` overrides the button's own `shrink-0`,
	     which would otherwise push it past the edge instead of trimming. -->
	<div class="absolute end-2 top-2 z-1 flex max-w-[50%]">
		<Button
			size="sm"
			variant="secondary"
			class="h-8 min-w-0 shrink gap-1.5 rounded-full px-3 text-sm"
			aria-label={noteText === "" ? "Add note" : "Edit note"}
			onclick={() => (open = true)}
		>
			<NotePencilIcon weight="fill" class="size-3.5 shrink-0" />
			<span class="min-w-0 truncate">
				{noteText === "" ? "Add note" : noteText}
			</span>
		</Button>
	</div>
	<ProfileNoteEditor {profileId} {note} bind:open />
{/if}
