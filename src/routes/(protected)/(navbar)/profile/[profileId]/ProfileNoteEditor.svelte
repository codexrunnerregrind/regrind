<script lang="ts">
	import { untrack } from "svelte";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		EMPTY_FAVORITE_NOTE,
		favoriteNote,
		refreshFavoriteNote,
	} from "$lib/api/users/favorite-notes-state.svelte";
	import {
		deleteFavoriteNote,
		setFavoriteNote,
	} from "$lib/api/users/favorites";
	import { Button, buttonVariants } from "$lib/components/ui/button";
	import * as Drawer from "$lib/components/ui/drawer";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Spinner } from "$lib/components/ui/spinner";
	import { Textarea } from "$lib/components/ui/textarea";
	import {
		FAVORITE_NOTE_MAX_LENGTH,
		FAVORITE_NOTE_PHONE_MAX_LENGTH,
		type FavoriteNoteContent,
		favoriteNoteIsEmpty,
	} from "$lib/model/users/favorites";
	import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";

	let {
		profileId,
		note,
		open = $bindable(),
	}: {
		profileId: number;
		/** The stored note, or `null` while it is still being read. */
		note: FavoriteNoteContent | null;
		open: boolean;
	} = $props();

	const stored = $derived(note ?? EMPTY_FAVORITE_NOTE);

	let notesValue = $state("");
	let phoneValue = $state("");
	let saving = $state(false);
	let removing = $state(false);
	let saveFailed = $state(false);

	// Seeded when the drawer opens and never again: `stored` is read untracked so
	// that a note landing in the cache later — a background read, or the
	// read-back of a save — cannot wipe what is being typed.
	$effect(() => {
		if (!open) return;
		const seed = untrack(() => stored);
		notesValue = seed.notes;
		phoneValue = seed.phoneNumber;
		saveFailed = false;
	});

	$effect(() => {
		if (!open) return;
		const onBackGesture = () => {
			open = false;
			return false;
		};
		backGestureEventHandlers.add(onBackGesture);
		return () => {
			backGestureEventHandlers.delete(onBackGesture);
		};
	});

	const notesRemaining = $derived(FAVORITE_NOTE_MAX_LENGTH - notesValue.length);
	const tooLong = $derived(notesRemaining < 0);
	const dirty = $derived(
		notesValue !== stored.notes || phoneValue !== stored.phoneNumber,
	);
	const busy = $derived(saving || removing);
	const hasStoredNote = $derived(note !== null && !favoriteNoteIsEmpty(note));

	async function save() {
		if (busy || !dirty || tooLong) return;
		const updated = {
			notes: notesValue.trim(),
			phoneNumber: phoneValue.trim(),
		};
		saving = true;
		try {
			// An emptied note is deleted rather than stored blank, so the profile
			// falls back to the "add a note" pill like it never had one.
			if (favoriteNoteIsEmpty(updated)) {
				await deleteFavoriteNote({ profileId });
				await refreshFavoriteNote(profileId);
				open = false;
				toast.success("Note deleted");
				return;
			}
			await setFavoriteNote({ profileId, note: updated });
			// Confirmed against the server rather than assumed: the PUT answers with
			// an empty 204, so a write it accepted and did not keep would look saved
			// until the app was restarted. The drawer stays open on a mismatch so the
			// text is not lost with it.
			await refreshFavoriteNote(profileId);
			const server = favoriteNote(profileId) ?? EMPTY_FAVORITE_NOTE;
			if (
				server.notes !== updated.notes ||
				server.phoneNumber !== updated.phoneNumber
			) {
				saveFailed = true;
				toast.error("The server did not keep this note");
				return;
			}
			saveFailed = false;
			open = false;
			toast.success("Note saved");
		} catch (error) {
			showErrorToast({ label: "Failed to save note", error });
		} finally {
			saving = false;
		}
	}

	async function remove() {
		if (busy) return;
		removing = true;
		try {
			await deleteFavoriteNote({ profileId });
			await refreshFavoriteNote(profileId);
			if (
				!favoriteNoteIsEmpty(favoriteNote(profileId) ?? EMPTY_FAVORITE_NOTE)
			) {
				toast.error("The server still has this note");
				return;
			}
			open = false;
			toast.success("Note deleted");
		} catch (error) {
			showErrorToast({ label: "Failed to delete note", error });
		} finally {
			removing = false;
		}
	}
</script>

<Drawer.Root bind:open>
	<Drawer.Content
		preventOverflowTextSelection={false}
		class="mx-auto max-w-160"
	>
		<Drawer.Header>
			<Drawer.Title>Note</Drawer.Title>
			<Drawer.Description>
				Only you can see this. It stays with the profile in your favorites.
			</Drawer.Description>
		</Drawer.Header>
		<div class="flex flex-col gap-4 px-4 pb-2">
			<div class="flex flex-col gap-1.5">
				<!-- The drawer's own title says "Note", so the field is labelled for
				     assistive tech only and the row just carries the counter. -->
				<div class="flex items-baseline justify-end">
					<span
						class={[
							"shrink-0 text-caption tabular-nums",
							{
								"text-destructive": tooLong,
								"text-muted-foreground": !tooLong,
							},
						]}
					>
						{notesRemaining}
					</span>
				</div>
				<Textarea
					aria-label="Note"
					bind:value={notesValue}
					placeholder="Add personal details, where you met, and more."
					aria-invalid={tooLong}
					class="max-h-40 min-h-24 overflow-y-auto rounded-lg"
				/>
				{#if tooLong}
					<span class="text-caption text-destructive">
						Too long, please shorten
					</span>
				{/if}
			</div>
			<div class="flex flex-col gap-1.5">
				<Label class="px-1" for="favorite-note-phone">Phone number</Label>
				<Input
					id="favorite-note-phone"
					type="tel"
					bind:value={phoneValue}
					maxlength={FAVORITE_NOTE_PHONE_MAX_LENGTH}
					placeholder="Optional"
					class="rounded-lg"
				/>
			</div>
			{#if saveFailed}
				<span class="px-1 text-caption text-destructive">
					The server accepted this note but kept nothing. Your text is still
					here — try saving again.
				</span>
			{/if}
		</div>
		<Drawer.Footer>
			<Button disabled={busy || !dirty || tooLong} onclick={() => void save()}>
				{#if saving}
					<Spinner class="size-4" />
				{/if}
				Save
			</Button>
			{#if hasStoredNote}
				<Button
					variant="ghost"
					class="text-destructive"
					disabled={busy}
					onclick={() => void remove()}
				>
					{#if removing}
						<Spinner class="size-4" />
					{/if}
					Delete note
				</Button>
			{:else}
				<Drawer.Close class={buttonVariants({ variant: "ghost" })}>
					Cancel
				</Drawer.Close>
			{/if}
		</Drawer.Footer>
	</Drawer.Content>
</Drawer.Root>
