<script lang="ts">
	import FolderOpenIcon from "phosphor-svelte/lib/FolderOpenIcon";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error";
	import {
		ensureAlbumSharesSwept,
		getAlbumShared,
		setAlbumShared,
	} from "$lib/api/messaging/album-shares-state.svelte";
	import {
		getMyAlbums,
		shareAlbum,
		unshareAlbum,
	} from "$lib/api/messaging/albums";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import {
		AlbumExpiration,
		type AlbumExpirationType,
		albumExpirationTypeSchema,
		type MyAlbum,
	} from "$lib/model/messaging/albums";
	import { getConversationState } from "../../conversation-state.svelte";

	// Keyed by `AlbumExpiration` rather than `AlbumExpirationType` so that adding
	// an expiration option fails the typecheck until it is given a label here.
	const EXPIRATION_LABELS: Record<keyof typeof AlbumExpiration, string> = {
		INDEFINITE: "Indefinitely",
		ONCE: "View once",
		TEN_MINUTES: "10 minutes",
		ONE_HOUR: "60 minutes",
		ONE_DAY: "24 hours",
	};

	let {
		active,
		onClose,
	}: {
		/** Whether this tab is the one on screen. */
		active: boolean;
		onClose: () => void;
	} = $props();

	const conversationState = $derived(getConversationState()());
	const recipientId = $derived(conversationState.profile?.profileId ?? null);

	let albums = $state<MyAlbum[] | null>(null);
	let error = $state<unknown>(null);
	let selectedAlbumId = $state<number | null>(null);
	let expirationType = $state<AlbumExpirationType>("INDEFINITE");
	let sharing = $state(false);

	/**
	 * Derived from the shared record rather than kept alongside it, so reopening
	 * the sheet shows what is already known without waiting on the lookups
	 * below, and share/unshare only have to write to the record.
	 */
	const sharedWith = $derived(
		new Set(
			recipientId === null
				? []
				: (albums ?? [])
						.filter(
							(album) => getAlbumShared(album.albumId, recipientId) === true,
						)
						.map((album) => album.albumId),
		),
	);

	const selectedIsShared = $derived(
		selectedAlbumId !== null && sharedWith.has(selectedAlbumId),
	);

	async function load() {
		albums = null;
		error = null;
		try {
			const list = await getMyAlbums();
			albums = list;
			if (recipientId !== null) void ensureAlbumSharesSwept(recipientId, list);
		} catch (err) {
			console.error(err);
			error = err;
		}
	}

	// Deliberately not loading on mount: Tabs.Content is rendered whether or not
	// its tab is showing, so mounting would fetch albums every time the
	// attachments sheet is opened, including to send a photo.
	$effect(() => {
		if (active && albums === null && error === null) void load();
	});

	function albumCover(album: MyAlbum): string | null {
		const first = album.content[0];
		return first?.coverUrl ?? first?.thumbUrl ?? null;
	}

	async function share() {
		if (selectedAlbumId === null || recipientId === null || sharing) return;
		sharing = true;
		try {
			await shareAlbum({
				albumId: selectedAlbumId,
				profileIds: [recipientId],
				expirationType,
			});
			setAlbumShared(selectedAlbumId, recipientId, true);
			onClose();
			toast.success("Album shared");
		} catch (err) {
			console.error(err);
			showErrorToast({ label: "Failed to share album", error: err });
		} finally {
			sharing = false;
		}
	}

	async function unshare() {
		const albumId = selectedAlbumId;
		if (albumId === null || recipientId === null || sharing) return;
		sharing = true;
		try {
			await unshareAlbum({ albumId, profileIds: [recipientId] });
			// Stays open: unsharing is a correction, and closing would hide the
			// result of it. The list derives from the record, so this is all the
			// update it needs.
			setAlbumShared(albumId, recipientId, false);
			toast.success("Album unshared");
		} catch (err) {
			console.error(err);
			showErrorToast({ label: "Failed to unshare album", error: err });
		} finally {
			sharing = false;
		}
	}
</script>

<div class="flex flex-col gap-4 pb-2">
	{#if error !== null}
		<div class="flex flex-1 py-8">
			<ApiErrorDisplay {error} onRetry={() => void load()} class="m-auto" />
		</div>
	{:else if albums === null}
		<div class="flex flex-col gap-2">
			{#each Array(3)}
				<Skeleton class="h-18 w-full" />
			{/each}
		</div>
	{:else if albums.length === 0}
		<Empty.Root>
			<Empty.Header>
				<Empty.Media variant="icon">
					<FolderOpenIcon weight="fill" />
				</Empty.Media>
				<Empty.Title>No albums yet</Empty.Title>
				<Empty.Description>
					Albums you create will show up here.
				</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else}
		<div class="flex flex-col gap-2">
			{#each albums as album (album.albumId)}
				{@const isSelected = selectedAlbumId === album.albumId}
				{@const cover = albumCover(album)}
				<button
					type="button"
					disabled={!album.isShareable}
					class={[
						"flex items-center gap-3 rounded-2xl border p-2 text-start transition-colors",
						{
							"cursor-pointer border-border hover:bg-card-foreground/5":
								album.isShareable && !isSelected,
							"border-primary bg-primary/10": isSelected,
							"opacity-50": !album.isShareable,
						},
					]}
					aria-pressed={isSelected}
					onclick={() => (selectedAlbumId = album.albumId)}
				>
					{#if cover}
						<img
							src={cover}
							alt=""
							class="size-14 shrink-0 rounded-xl bg-card-foreground/10 object-cover"
							draggable="false"
						/>
					{:else}
						<div
							class="flex size-14 shrink-0 items-center justify-center rounded-xl bg-card-foreground/10 text-muted-foreground"
						>
							<FolderOpenIcon weight="fill" class="size-6" />
						</div>
					{/if}
					<div class="flex min-w-0 flex-col">
						<span class="truncate font-medium">
							{album.albumName ?? "Untitled album"}
						</span>
						<span class="text-sm text-muted-foreground">
							{album.content.length}
							{album.content.length === 1 ? "item" : "items"}
							{#if !album.isShareable}
								&middot; can't be shared
							{:else if sharedWith.has(album.albumId)}
								&middot; already shared
							{/if}
						</span>
					</div>
				</button>
			{/each}
		</div>

		<!-- Meaningless while the action is unsharing. -->
		<div class={["flex flex-col gap-2", { hidden: selectedIsShared }]}>
			<span class="text-sm font-medium text-muted-foreground">Viewable for</span
			>
			<ToggleGroup.Root
				type="single"
				variant="outline"
				class="flex-wrap"
				bind:value={
					() => expirationType,
					(next: string) => {
						// Deselecting sends "", and the value is a plain string either
						// way, so fall back rather than trusting it.
						const parsed = albumExpirationTypeSchema.safeParse(next);
						expirationType = parsed.success ? parsed.data : "INDEFINITE";
					}
				}
			>
				{#each Object.entries(EXPIRATION_LABELS) as [option, label] (option)}
					<ToggleGroup.Item value={option}>
						{label}
					</ToggleGroup.Item>
				{/each}
			</ToggleGroup.Root>
		</div>

		{#if selectedIsShared}
			<Button
				size="lg"
				variant="outline"
				disabled={recipientId === null || sharing}
				onclick={() => void unshare()}
			>
				{sharing ? "Unsharing…" : "Unshare album"}
			</Button>
		{:else}
			<Button
				size="lg"
				disabled={selectedAlbumId === null || recipientId === null || sharing}
				onclick={() => void share()}
			>
				{sharing ? "Sharing…" : "Share album"}
			</Button>
		{/if}
	{/if}
</div>
