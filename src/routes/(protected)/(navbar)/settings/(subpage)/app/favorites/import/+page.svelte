<script lang="ts" module>
	import { SvelteSet } from "svelte/reactivity";

	import type { FavoriteTransferEntry } from "$lib/favorites/transfer";

	// Held only for a look at a profile and back; see `beforeNavigate` below.
	const kept: {
		entries: FavoriteTransferEntry[] | null;
		notesOnly: boolean;
	} = { entries: null, notesOnly: false };
	const selected = new SvelteSet<number>();
</script>

<script lang="ts">
	import { beforeNavigate } from "$app/navigation";
	import { FolderOpenIcon } from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import ProfileActionRowSkeleton from "$lib/components/profile/ProfileActionRowSkeleton.svelte";
	import { Button } from "$lib/components/ui/button";
	import {
		favoriteHasNote,
		FavoritesImportError,
		importFavorites,
		loadFavoritesToImport,
		parseFavoritesExport,
	} from "$lib/favorites/transfer";
	import { pickTextFile } from "$lib/platform/data-file";
	import FavoriteSelectList from "../FavoriteSelectList.svelte";

	let entries = $state<FavoriteTransferEntry[] | null>(kept.entries);
	let loading = $state(false);
	let error = $state<unknown>(null);
	let importing = $state(false);
	let barHeight = $state(0);

	let notesOnly = $state(kept.notesOnly);
	$effect(() => {
		kept.notesOnly = notesOnly;
	});

	// Only a profile preview is worth coming back to. Leaving the flow for
	// anywhere else drops what is held, so a later visit reads the account
	// again instead of showing a list that has since gone stale.
	beforeNavigate(({ to }) => {
		if (to?.route.id?.includes("/profile/")) return;
		kept.entries = null;
		selected.clear();
	});

	const notedCount = $derived(
		(entries ?? []).filter((entry) => favoriteHasNote(entry)).length,
	);
	const visible = $derived(
		(entries ?? []).filter((entry) => !notesOnly || favoriteHasNote(entry)),
	);
	// Only what is on screen: filtering someone out takes them out of the run,
	// so the button count always matches the list above it.
	const chosen = $derived(
		visible.filter((entry) => selected.has(entry.profileId)),
	);

	async function pick() {
		if (loading || importing) return;
		loading = true;
		error = null;
		try {
			const text = await pickTextFile();
			if (text === null) return;
			const data = parseFavoritesExport(text);
			if (data.favorites.length === 0) {
				toast.info("That export has no favorites in it");
				return;
			}
			// Names and avatars first: a list of bare ids is not something
			// anyone can meaningfully tick through.
			const loaded = await loadFavoritesToImport(data);
			entries = loaded;
			kept.entries = loaded;
			selected.clear();
			for (const entry of loaded) selected.add(entry.profileId);
		} catch (caught) {
			console.error(caught);
			if (caught instanceof FavoritesImportError) {
				toast.error(caught.message);
			} else {
				error = caught;
			}
		} finally {
			loading = false;
		}
	}

	async function run() {
		if (importing || chosen.length === 0) return;
		importing = true;
		const total = chosen.length;
		const toastId = toast.loading(`Adding 0 of ${total}…`);
		try {
			const result = await importFavorites(chosen, (done) => {
				if (done < total) {
					toast.loading(`Adding ${done} of ${total}…`, {
						id: toastId,
					});
				}
			});
			const label =
				result.added === 1
					? "Added 1 favorite"
					: `Added ${result.added} favorites`;
			const problems = [
				result.failed > 0 ? `${result.failed} failed` : null,
				result.notesFailed > 0
					? `${result.notesFailed} without their note`
					: null,
			].filter((part) => part !== null);
			if (problems.length > 0) {
				toast.warning(`${label} — ${problems.join(", ")}`, {
					id: toastId,
				});
			} else {
				toast.success(label, { id: toastId });
			}
			entries = null;
			kept.entries = null;
			selected.clear();
		} catch (caught) {
			console.error(caught);
			toast.dismiss(toastId);
			showErrorToast({
				label: "Couldn't import favorites",
				error: caught,
			});
		} finally {
			importing = false;
		}
	}
</script>

<svelte:head>
	<title>Import favorites</title>
</svelte:head>

<p class="pt-1 pb-3.5 text-preview/[1.45] text-pretty text-ink3">
	Pick a file you exported earlier. Everyone in it is added to the favorites
	you already have, and their notes replace any note you have written for the
	same profile — nothing is removed.
</p>

{#if error !== null}
	<ApiErrorDisplay {error} onRetry={() => void pick()} class="my-2" />
{:else if loading}
	<div class="flex flex-col">
		{#each Array(6)}
			<ProfileActionRowSkeleton />
		{/each}
	</div>
{:else if entries === null}
	<Button variant="outline" class="w-full" onclick={() => void pick()}>
		<FolderOpenIcon weight="fill" />
		Choose a file
	</Button>
{:else}
	<!-- See the export screen: the scroller's bottom padding is replaced by the
	     bar's measured height so the last row clears it. -->
	<div
		class="mb-[calc(-4rem-0.5rem-var(--content-pb)-var(--bar-content-gap))]"
		style:padding-bottom="{barHeight}px"
	>
		<FavoriteSelectList
			entries={visible}
			{selected}
			bind:notesOnly
			total={entries.length}
			noted={notedCount}
			disabled={importing}
		/>
	</div>
	<div
		bind:clientHeight={barHeight}
		class="fixed inset-x-0 bottom-0 z-40 bg-background px-4 pt-4 pb-nav-clear"
	>
		<div
			class="mx-auto flex w-full max-w-120 flex-col gap-2 sm:flex-row-reverse"
		>
			<Button
				class="w-full"
				disabled={importing || chosen.length === 0}
				onclick={() => void run()}
			>
				{chosen.length === 1
					? "Import 1 favorite"
					: `Import ${chosen.length} favorites`}
			</Button>
			<Button
				variant="outline"
				class="w-full"
				disabled={importing}
				onclick={() => void pick()}
			>
				Choose another file
			</Button>
		</div>
	</div>
{/if}
