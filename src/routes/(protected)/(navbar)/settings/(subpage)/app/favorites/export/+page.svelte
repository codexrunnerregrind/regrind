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
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import ProfileActionRowSkeleton from "$lib/components/profile/ProfileActionRowSkeleton.svelte";
	import { Button } from "$lib/components/ui/button";
	import {
		buildFavoritesExport,
		favoriteHasNote,
		favoritesExportFilename,
		loadFavoritesToExport,
		serializeFavoritesExport,
	} from "$lib/favorites/transfer";
	import { type SaveFileResult, saveTextFile } from "$lib/platform/data-file";
	import FavoriteSelectList from "../FavoriteSelectList.svelte";

	let entries = $state<FavoriteTransferEntry[] | null>(kept.entries);
	let loading = $state(kept.entries === null);
	let error = $state<unknown>(null);
	let saving = $state(false);
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

	async function load() {
		loading = true;
		error = null;
		try {
			const loaded = await loadFavoritesToExport();
			entries = loaded;
			kept.entries = loaded;
			// Exporting everything is the common case; deselecting is the edit.
			selected.clear();
			for (const entry of loaded) selected.add(entry.profileId);
		} catch (caught) {
			console.error(caught);
			error = caught;
		} finally {
			loading = false;
		}
	}

	// `shareFromGesture` is not a failure: the file is ready and only needs a
	// fresh tap, so it is offered as a button rather than reported as an error.
	function report(
		result: SaveFileResult,
		count: number,
		toastId: string | number,
	): void {
		const shareAgain = result.shareFromGesture;
		if (shareAgain !== undefined) {
			toast.info("Ready to save", {
				id: toastId,
				description: "Tap to choose where it goes.",
				duration: Infinity,
				action: {
					label: "Save",
					onClick: () => {
						const next = toast.loading("Saving…");
						shareAgain()
							.then((again) => report(again, count, next))
							.catch((caught: unknown) => {
								toast.dismiss(next);
								showErrorToast({
									label: "Couldn't export favorites",
									error: caught,
								});
							});
					},
				},
			});
			return;
		}
		if (result.cancelled) {
			toast.dismiss(toastId);
			return;
		}
		toast.success(
			count === 1 ? "Exported 1 favorite" : `Exported ${count} favorites`,
			{ id: toastId },
		);
	}

	async function save() {
		if (saving || chosen.length === 0) return;
		saving = true;
		const toastId = toast.loading("Saving…");
		try {
			const result = await saveTextFile(
				favoritesExportFilename(),
				serializeFavoritesExport(buildFavoritesExport(chosen)),
			);
			report(result, chosen.length, toastId);
		} catch (caught) {
			console.error(caught);
			toast.dismiss(toastId);
			showErrorToast({
				label: "Couldn't export favorites",
				error: caught,
			});
		} finally {
			saving = false;
		}
	}

	// Only on a first visit; coming back from a profile keeps what was ticked.
	if (kept.entries === null) void load();
</script>

<svelte:head>
	<title>Export favorites</title>
</svelte:head>

<p class="pt-1 pb-3.5 text-preview/[1.45] text-pretty text-ink3">
	Everyone you have favorited, with the notes and phone numbers attached to
	them. Untick anyone you would rather leave out of the file.
</p>

{#if error !== null}
	<ApiErrorDisplay {error} onRetry={() => void load()} class="my-2" />
{:else if loading || entries === null}
	<div class="flex flex-col">
		{#each Array(6)}
			<ProfileActionRowSkeleton />
		{/each}
	</div>
{:else if entries.length === 0}
	<span class="text-sm text-muted-foreground">
		You haven't favorited anyone yet.
	</span>
{:else}
	<!-- The scroller's own bottom padding is cancelled and replaced by the bar's
	     measured height, so the last row clears the bar exactly. -->
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
			disabled={saving}
		/>
	</div>
	<!-- Fixed rather than sticky, and opaque all the way down to the screen
	     edge: the list runs long, so the action has to stay put, and anything
	     showing through between it and the tab bar reads as a bug. Below the
	     tab bar's z-50 so the capsule still floats on top. -->
	<div
		bind:clientHeight={barHeight}
		class="fixed inset-x-0 bottom-0 z-40 bg-background px-4 pt-4 pb-nav-clear"
	>
		<div class="mx-auto w-full max-w-120">
			<Button
				class="w-full"
				disabled={saving || chosen.length === 0}
				onclick={() => void save()}
			>
				{chosen.length === 1
					? "Export 1 favorite"
					: `Export ${chosen.length} favorites`}
			</Button>
		</div>
	</div>
{/if}
