<script lang="ts">
	import CaretDownIcon from "phosphor-svelte/lib/CaretDownIcon";
	import CheckCircleIcon from "phosphor-svelte/lib/CheckCircleIcon";
	import FolderOpenIcon from "phosphor-svelte/lib/FolderOpenIcon";
	import ImageBrokenIcon from "phosphor-svelte/lib/ImageBrokenIcon";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
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
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import * as Empty from "$lib/components/ui/empty";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import {
		type AlbumExpirationType,
		type MyAlbum,
	} from "$lib/model/messaging/albums";
	import type { AlbumExpiration } from "$lib/model/messaging/albums";
	import { getConversationState } from "../../conversation-state.svelte";

	// Expiry choices, ordered to match the official app.
	const EXPIRATION_OPTIONS: {
		value: keyof typeof AlbumExpiration;
		label: string;
	}[] = [
		{ value: "ONE_DAY", label: "For 24 hours" },
		{ value: "ONE_HOUR", label: "For 1 hour" },
		{ value: "TEN_MINUTES", label: "For 10 minutes" },
		{ value: "ONCE", label: "View once" },
		{ value: "INDEFINITE", label: "Indefinitely" },
	];

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
	let selectedIds = $state<Set<number>>(new Set());
	let expirationType = $state<AlbumExpirationType>("INDEFINITE");
	let sharing = $state(false);

	const expirationLabel = $derived(
		EXPIRATION_OPTIONS.find((o) => o.value === expirationType)?.label ??
			"Indefinitely",
	);

	const sharedAlbumIds = $derived(
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

	// Selecting an already-shared album flips the sheet into "stop sharing"
	// intent. Shared and unshared albums can't be mixed in one selection (see
	// `toggle`), so a single selected shared album is enough to decide the mode.
	const stopMode = $derived(
		[...selectedIds].some((id) => sharedAlbumIds.has(id)),
	);

	async function load() {
		albums = null;
		error = null;
		try {
			const list = await getMyAlbums();
			albums = list.filter((album) => album.isShareable);
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

	function toggle(albumId: number) {
		const next = new Set(selectedIds);
		if (next.has(albumId)) {
			next.delete(albumId);
		} else {
			// Never mix shared and unshared albums: tapping one whose share state
			// differs from the current selection starts a fresh selection instead.
			const wasStop = [...next].some((id) => sharedAlbumIds.has(id));
			if (next.size > 0 && wasStop !== sharedAlbumIds.has(albumId))
				next.clear();
			next.add(albumId);
		}
		selectedIds = next;
	}

	async function share() {
		if (selectedIds.size === 0 || recipientId === null || sharing) return;
		sharing = true;
		const ids = [...selectedIds];
		try {
			await Promise.all(
				ids.map((albumId) =>
					shareAlbum({ albumId, profileIds: [recipientId], expirationType }),
				),
			);
			for (const albumId of ids) setAlbumShared(albumId, recipientId, true);
			onClose();
			toast.success(ids.length === 1 ? "Album shared" : "Albums shared");
		} catch (err) {
			console.error(err);
			showErrorToast({ label: "Failed to share album", error: err });
		} finally {
			sharing = false;
		}
	}

	async function unshare() {
		if (selectedIds.size === 0 || recipientId === null || sharing) return;
		sharing = true;
		const ids = [...selectedIds];
		// Optimistically lock the shared-album bubbles in the chat so they show as
		// no longer viewable straight away; revert them if the request fails.
		const reverts = ids.map(
			(albumId) => conversationState.lockSharedAlbum(albumId).revert,
		);
		try {
			await Promise.all(
				ids.map((albumId) =>
					unshareAlbum({ albumId, profileIds: [recipientId] }),
				),
			);
			for (const albumId of ids) setAlbumShared(albumId, recipientId, false);
			onClose();
			toast.success(ids.length === 1 ? "Album unshared" : "Albums unshared");
		} catch (err) {
			for (const revert of reverts) revert();
			console.error(err);
			showErrorToast({ label: "Failed to unshare album", error: err });
		} finally {
			sharing = false;
		}
	}
</script>

<div class="@container/photo-grid flex flex-col gap-3 rounded-grid">
	{#if error !== null}
		<div class="flex flex-1">
			<ApiErrorDisplay {error} onRetry={() => void load()} class="m-auto" />
		</div>
	{:else if albums === null}
		<div class="photo-grid">
			{#each Array(6)}
				<Skeleton class="aspect-3/4 rounded-none" />
			{/each}
		</div>
	{:else if albums.length === 0}
		<Empty.Root>
			<Empty.Header>
				<Empty.Media variant="icon">
					<FolderOpenIcon weight="fill" />
				</Empty.Media>
				<Empty.Title>No albums to share</Empty.Title>
				<Empty.Description>
					Albums you create appear here, ready to share.
				</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else}
		<div class="photo-grid">
			{#each albums as album (album.albumId)}
				{@const isSelected = selectedIds.has(album.albumId)}
				{@const isShared = sharedAlbumIds.has(album.albumId)}
				{@const cover =
					album.content[0]?.coverUrl || album.content[0]?.thumbUrl}
				<button
					type="button"
					class={[
						"relative aspect-3/4 rounded-[inherit] outline-3 -outline-offset-3 transition-[outline]",
						{
							"outline-primary": isSelected,
							"outline-transparent": !isSelected,
						},
					]}
					aria-pressed={isSelected}
					aria-label={isSelected ? "Deselect album" : "Select album"}
					onclick={() => toggle(album.albumId)}
				>
					{#if cover}
						<img
							src={cover}
							alt=""
							class="size-full rounded-[inherit] bg-card-foreground/10 object-cover"
							draggable="false"
						/>
					{:else}
						<div
							class="flex size-full items-center justify-center rounded-[inherit] bg-card-foreground/20"
						>
							<ImageBrokenIcon
								weight="fill"
								class="size-8"
								color="var(--media-placeholder-foreground)"
							/>
						</div>
					{/if}
					<div
						class="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-1 rounded-b-[inherit] bg-linear-to-t from-black/70 to-transparent p-2 pt-6 text-start"
					>
						<span class="line-clamp-2 text-xs font-medium text-white">
							{album.albumName || "Untitled album"}
						</span>
					</div>
					{#if isSelected}
						<span
							class="absolute top-1.5 right-1.5 text-primary"
							aria-hidden="true"
						>
							<CheckCircleIcon weight="fill" class="size-6" />
						</span>
					{:else if isShared}
						<span
							class="pointer-events-none absolute top-1.5 left-1.5 rounded-full bg-primary/90 px-2 py-0.5 text-xs font-medium text-primary-foreground"
						>
							Shared
						</span>
					{/if}
				</button>
			{/each}
		</div>

		<!-- Reserve room so the last row can scroll clear of the floating bar. -->
		<div class="h-32 shrink-0" aria-hidden="true"></div>

		<!-- Expiry dropdown + share/stop-share. Floated over the bottom of the
		     sheet (like the media tab's Send button) so it stays visible without
		     dragging the sheet up, regardless of how many albums there are. -->
		<div
			class="pointer-events-none absolute inset-x-0 bottom-18 flex flex-col items-center gap-3 bg-linear-to-t from-popover via-popover to-transparent px-4 pt-8 pb-1"
		>
			{#if !stopMode}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<button
								{...props}
								type="button"
								class="pointer-events-auto flex items-center gap-2 text-lg font-semibold"
							>
								<CheckCircleIcon weight="regular" class="size-6 text-primary" />
								{expirationLabel}
								<CaretDownIcon weight="bold" class="size-4" />
							</button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content class="w-52" align="center">
						<DropdownMenu.Label>Share album for…</DropdownMenu.Label>
						{#each EXPIRATION_OPTIONS as option (option.value)}
							<DropdownMenu.Item
								onSelect={() => (expirationType = option.value)}
							>
								{#if option.value === expirationType}
									<CheckCircleIcon weight="fill" class="size-5 text-primary" />
								{:else}
									<span class="size-5"></span>
								{/if}
								{option.label}
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}

			<Button
				size="lg"
				variant={stopMode ? "destructive" : "default"}
				class="pointer-events-auto w-full shadow-lg"
				disabled={selectedIds.size === 0 || recipientId === null || sharing}
				onclick={() => void (stopMode ? unshare() : share())}
			>
				{#if sharing}
					{stopMode ? "Stopping…" : "Sharing…"}
				{:else if stopMode}
					{selectedIds.size > 1
						? `Stop Sharing ${selectedIds.size} Albums`
						: "Stop Sharing"}
				{:else if selectedIds.size > 1}
					Share {selectedIds.size} Albums
				{:else}
					Share Album
				{/if}
			</Button>
		</div>
	{/if}
</div>
