<script lang="ts">
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";
	import XIcon from "phosphor-svelte/lib/XIcon";

	import { savedPhrases } from "$lib/chat/saved-phrases.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Input } from "$lib/components/ui/input";
	import { SAVED_PHRASE_MAX_LENGTH } from "$lib/model/messaging/phrases";
	import { hapticImpact } from "$lib/platform/haptics";
	import { longPressHandlers } from "$lib/util/long-press";
	import { keepKeyboard } from "./keep-keyboard";
	import { getMessageComposerContext } from "./message-composer-context.svelte";

	let {
		onSelect,
		draft,
	}: {
		/** Hands the phrase to the composer, which replaces whatever is typed. */
		onSelect: (text: string) => void;
		/** What is in the field right now — the seed for "save this one". */
		draft: string;
	} = $props();

	const { disabled } = $derived(getMessageComposerContext()());

	let editing = $state(false);
	// `null` while the dialog is closed; the phrase's id when renaming one,
	// `"new"` when adding.
	let editor: { id: string | null; value: string } | null = $state(null);

	const phrases = $derived(savedPhrases.phrases);

	$effect(() => {
		void savedPhrases.load();
	});

	// Deleting the last chip leaves nothing to edit, so edit mode ends with it.
	$effect(() => {
		if (phrases.length === 0) editing = false;
	});

	function openAdd() {
		editor = { id: null, value: draft.trim() };
	}

	function openRename(id: string, text: string) {
		editor = { id, value: text };
	}

	function submitEditor() {
		const pending = editor;
		if (pending === null || pending.value.trim() === "") return;
		editor = null;
		if (pending.id === null) void savedPhrases.add(pending.value);
		else void savedPhrases.rename({ id: pending.id, text: pending.value });
	}

	function enterEditMode() {
		if (disabled) return;
		hapticImpact("medium");
		editing = true;
	}

	function pick(phrase: { id: string; text: string }) {
		if (editing) {
			openRename(phrase.id, phrase.text);
			return;
		}
		hapticImpact("light");
		onSelect(phrase.text);
		savedPhrases.use(phrase.id);
	}
</script>

<!-- Above the field rather than inside it: the chips scroll sideways as a row
     of their own, and the attach/type/send row keeps its fixed geometry.
     `-mt-0.5` claws back a little of the form's top padding: the bar is closer to
     the field than to the last message, which is what it belongs to, and
     `-mb-1` lets the scrollbar's lane double as the gap above the field. -->
{#if !savedPhrases.loading}
	<div class="-mt-0.5 -mb-1 flex flex-col gap-1">
		{#if editing}
			<div class="flex items-center justify-between gap-2 px-0.5">
				<span
					class="text-section font-semibold tracking-wide text-muted-foreground uppercase"
				>
					Saved phrases
				</span>
				<button
					type="button"
					class="text-meta font-semibold text-primary"
					onpointerdown={keepKeyboard}
					onmousedown={keepKeyboard}
					onclick={() => (editing = false)}
				>
					Done
				</button>
			</div>
		{/if}
		<!-- `-mx-1 px-1` so a chip's focus ring is not clipped by the scroller. The
		     delete control sits inside the pill rather than hanging off its
		     corner: a sideways scroller clips vertically too, which cut the badge
		     in half. `pb-2` is the scrollbar's lane — it draws at the bottom of
		     the padding box, and against the chips it read as an underline. -->
		<div class="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-2">
			{#each phrases as phrase (phrase.id)}
				{@const longPress = longPressHandlers(enterEditMode)}
				<div
					class={[
						"flex shrink-0 items-center rounded-full border border-border bg-muted",
						{ "pe-1": editing },
					]}
				>
					<button
						type="button"
						class="max-w-52 truncate rounded-full px-2.5 py-1 text-left text-meta text-foreground active:bg-foreground/10 disabled:opacity-50"
						{disabled}
						onclick={() => pick(phrase)}
						onmousedown={keepKeyboard}
						oncontextmenu={longPress.oncontextmenu}
						onpointerdown={longPress.onpointerdown}
						onpointermove={longPress.onpointermove}
						onpointerup={longPress.onpointerup}
						onpointercancel={longPress.onpointercancel}
					>
						{phrase.text}
					</button>
					{#if editing}
						<button
							type="button"
							aria-label={`Delete phrase "${phrase.text}"`}
							class="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-foreground/15 text-foreground active:bg-foreground/25"
							onpointerdown={keepKeyboard}
							onmousedown={keepKeyboard}
							onclick={() => void savedPhrases.remove(phrase.id)}
						>
							<XIcon size={11} weight="bold" />
						</button>
					{/if}
				</div>
			{/each}
			{#if phrases.length === 0}
				<!-- The prompt stands in for the row until there is a phrase in it,
				     so the feature is discoverable without a menu to go looking in. -->
				<button
					type="button"
					class="flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-meta text-muted-foreground active:bg-foreground/5 disabled:opacity-50"
					{disabled}
					onpointerdown={keepKeyboard}
					onmousedown={keepKeyboard}
					onclick={openAdd}
				>
					<PlusIcon size={13} />
					Save a phrase you send often
				</button>
			{:else}
				<button
					type="button"
					aria-label="Save a phrase"
					class="flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground active:bg-foreground/10 disabled:opacity-50"
					{disabled}
					onpointerdown={keepKeyboard}
					onmousedown={keepKeyboard}
					onclick={openAdd}
				>
					<PlusIcon size={13} />
				</button>
			{/if}
		</div>
		{#if editing}
			<span class="px-0.5 text-meta text-muted-foreground">
				Tap a phrase to rename it
			</span>
		{/if}
	</div>
{/if}

<Dialog.Root
	open={editor !== null}
	onOpenChange={(open) => {
		if (!open) editor = null;
	}}
>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>
				{editor?.id === null ? "Save a phrase" : "Rename phrase"}
			</Dialog.Title>
		</Dialog.Header>
		{#if editor !== null}
			<div class="flex flex-col gap-1.5">
				<Input
					bind:value={editor.value}
					class="h-12 rounded-lg border-border bg-background"
					placeholder="Phrase"
					maxlength={SAVED_PHRASE_MAX_LENGTH}
					autofocus
					onkeydown={(event: KeyboardEvent) => {
						if (event.key !== "Enter") return;
						event.preventDefault();
						submitEditor();
					}}
				/>
				<span class="text-meta text-ink3">
					Appears as a chip above the composer
				</span>
			</div>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (editor = null)}>
				Cancel
			</Button>
			<Button
				onclick={submitEditor}
				disabled={(editor?.value ?? "").trim() === ""}
			>
				Save
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
