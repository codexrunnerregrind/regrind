<script lang="ts">
	import { CaretRightIcon } from "phosphor-svelte";
	import type { SvelteSet } from "svelte/reactivity";

	import DisplayName from "$lib/components/profile/DisplayName.svelte";
	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import SettingsSegmented from "$lib/components/settings/SettingsSegmented.svelte";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import type { FavoriteTransferEntry } from "$lib/favorites/transfer";

	let {
		entries,
		selected,
		notesOnly = $bindable(),
		total,
		noted,
		disabled = false,
	}: {
		/** Already narrowed by {@link notesOnly}; the filter is applied upstream. */
		entries: FavoriteTransferEntry[];
		/** Profile ids that are ticked. Mutated in place. */
		selected: SvelteSet<number>;
		notesOnly: boolean;
		/** Counts before the filter, so each segment can say what it holds. */
		total: number;
		noted: number;
		disabled?: boolean;
	} = $props();

	// Counted over what is on screen, so the filter narrows the tally and
	// "Select all" with it — what you see is what gets exported.
	const selectedHere = $derived(
		entries.filter((entry) => selected.has(entry.profileId)).length,
	);
	const allSelected = $derived(
		entries.length > 0 && selectedHere === entries.length,
	);
</script>

<!-- Everyone by default: the note is an annotation on a favorite, not what
     makes one worth keeping. -->
<SettingsSegmented
	options={[
		{ value: "all", label: `All ${total}` },
		{ value: "notes", label: `With notes ${noted}` },
	]}
	bind:value={
		() => (notesOnly ? "notes" : "all"),
		(next: string) => (notesOnly = next === "notes")
	}
/>

<div class="flex items-center justify-between gap-3 pt-3 pb-3">
	<span class="section-label">
		{selectedHere} of {entries.length} selected
	</span>
	<button
		type="button"
		class="shrink-0 rounded-lg border border-border px-3 py-1.5 text-preview font-medium transition-colors disabled:opacity-50 can-hover:hover:bg-muted"
		{disabled}
		onclick={() => {
			const select = !allSelected;
			for (const entry of entries) {
				if (select) selected.add(entry.profileId);
				else selected.delete(entry.profileId);
			}
		}}
	>
		{allSelected ? "Deselect all" : "Select all"}
	</button>
</div>

{#if entries.length === 0}
	<span class="text-sm text-muted-foreground">
		None of them have a note yet.
	</span>
{/if}

<div class="flex flex-col">
	{#each entries as entry (entry.profileId)}
		{@const checked = selected.has(entry.profileId)}
		{@const name = entry.displayName ?? `profile ${entry.profileId}`}
		<!-- The tick and the profile are separate targets: ticking is the job
		     here, but deciding whether to tick someone often means looking at
		     them first, so the avatar and name open the profile instead. -->
		<div
			class={[
				"flex items-center not-last:border-b not-last:border-border",
				{ "opacity-55": disabled },
			]}
		>
			<label
				class={[
					"-me-1 flex shrink-0 self-stretch py-3.5 pe-3.5",
					{ "cursor-pointer": !disabled },
				]}
			>
				<Checkbox
					{checked}
					{disabled}
					onCheckedChange={(value) => {
						if (value) selected.add(entry.profileId);
						else selected.delete(entry.profileId);
					}}
					aria-label="Include {name}"
					class="my-auto"
				/>
			</label>
			<a
				href="/profile/{entry.profileId}"
				aria-label="{name}'s profile"
				class="flex min-w-0 flex-1 items-center gap-3.5 py-3.5"
			>
				<UserAvatar
					mediaHash={entry.profileImageMediaHash}
					class="size-12 shrink-0 overflow-hidden rounded-full bg-media-placeholder"
					size="lg"
				/>
				<span class="flex min-w-0 flex-1 flex-col gap-0.5">
					<DisplayName
						name={entry.displayName}
						class={[
							"truncate text-row",
							{
								"text-muted-foreground":
									entry.displayName === null,
								"font-semibold": entry.displayName !== null,
							},
						]}
					/>
					{#if entry.notes.trim() !== ""}
						<span class="truncate text-2xs text-ink3">
							{entry.notes}
						</span>
					{:else if entry.phoneNumber.trim() !== ""}
						<span class="truncate text-2xs text-ink3">
							{entry.phoneNumber}
						</span>
					{:else}
						<span class="truncate text-2xs text-ink3">
							Profile {entry.profileId}
						</span>
					{/if}
				</span>
				<CaretRightIcon
					weight="bold"
					class="size-4 shrink-0 text-muted-foreground/60"
				/>
			</a>
		</div>
	{/each}
</div>
