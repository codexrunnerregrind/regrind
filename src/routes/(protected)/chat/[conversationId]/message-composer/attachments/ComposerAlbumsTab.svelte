<script lang="ts">
	import FolderOpenIcon from "phosphor-svelte/lib/FolderOpenIcon";
	import ImagesIcon from "phosphor-svelte/lib/ImagesIcon";
	import LockSimpleIcon from "phosphor-svelte/lib/LockSimpleIcon";
	import VideoIcon from "phosphor-svelte/lib/VideoIcon";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		ensureAlbumSharesSwept,
		forgetAlbumShared,
		getAlbumShared,
		setAlbumShared,
	} from "$lib/api/messaging/album-shares-state.svelte";
	import {
		getMyAlbums,
		shareAlbum,
		unshareAlbum,
	} from "$lib/api/messaging/albums";
	import { getAlbumGridColumnsSnapshot } from "$lib/app-data/preferences.svelte";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import SelectionCheck from "$lib/components/shared/SelectionCheck.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import * as Empty from "$lib/components/ui/empty";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { proxyMediaUrl } from "$lib/util/media";
	import { SelectionSet } from "$lib/util/selection.svelte";
	import type { AlbumExpiration } from "$lib/model/messaging/albums";
	import type {
		AlbumExpirationType,
		MyAlbum,
	} from "$lib/model/messaging/albums";
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
		onSelectionChange,
	}: {
		/** Whether this tab is the one on screen. */
		active: boolean;
		onClose: () => void;
		onSelectionChange: (count: number) => void;
	} = $props();

	const conversationState = $derived(getConversationState()());
	const recipientId = $derived(conversationState.profile?.profileId ?? null);
	const selected = new SelectionSet<number>(10);

	let albums = $state<MyAlbum[] | null>(null);
	let error = $state<unknown>(null);
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
							(album) =>
								getAlbumShared(album.albumId, recipientId) ===
								true,
						)
						.map((album) => album.albumId),
		),
	);

	// Selecting an already-shared album flips the sheet into "stop sharing"
	// intent. Shared and unshared albums can't be mixed in one selection (see
	// `toggleSelected`), so one selected shared album decides the mode.
	const stopMode = $derived(
		selected.values().some((id) => sharedAlbumIds.has(id)),
	);

	async function load() {
		albums = null;
		error = null;
		try {
			const list = await getMyAlbums();
			albums = list;
			if (recipientId !== null)
				void ensureAlbumSharesSwept(recipientId, list);
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

	function toggleSelected(albumId: number) {
		if (!selected.has(albumId)) {
			// Never mix shared and unshared albums: tapping one whose share state
			// differs from the current selection starts a fresh selection instead.
			const wasStop = selected
				.values()
				.some((id) => sharedAlbumIds.has(id));
			if (selected.size > 0 && wasStop !== sharedAlbumIds.has(albumId))
				selected.clear();
		}
		selected.toggle(albumId);
		onSelectionChange(selected.size);
	}

	// Read by the sheet, which hosts the button and the expiry picker on the line
	// above the tab bar, level with the media tab's own send button.
	export function actionLabel(): string {
		if (stopMode) return "Stop sharing";
		return selected.size > 1
			? `Share ${selected.size} Albums`
			: "Share Album";
	}

	export function expiryControl() {
		if (stopMode || selected.size === 0) return null;
		return {
			title: "Share album for…",
			label: expirationLabel,
			selected: expirationType,
			options: EXPIRATION_OPTIONS,
			select: (value: AlbumExpirationType) => (expirationType = value),
		};
	}

	export function sendSelected() {
		if (albums === null || recipientId === null || sharing) return;
		const albumIds = selected.values();
		if (albumIds.length === 0) return;
		const stopping = stopMode;
		selected.clear();
		onSelectionChange(0);
		onClose();
		void (stopping
			? stopSharing(albumIds, recipientId)
			: startSharing(albumIds, recipientId));
	}

	async function startSharing(albumIds: number[], profileId: number) {
		sharing = true;
		try {
			await Promise.all(
				albumIds.map((albumId) =>
					shareAlbum({
						albumId,
						profileIds: [profileId],
						expirationType,
					}),
				),
			);
			for (const albumId of albumIds)
				setAlbumShared(albumId, profileId, true);
		} catch (err) {
			console.error(err);
			showErrorToast({ label: "Failed to share album", error: err });
		} finally {
			sharing = false;
		}
	}

	async function stopSharing(albumIds: number[], profileId: number) {
		sharing = true;
		// Optimistically lock the shared-album bubbles in the chat so they show as
		// no longer viewable straight away; revert them if the request fails. The
		// share state is part of that: a bubble reads it over its own body, so a
		// stale "shared" here would hold the lock off until the request returned.
		const wasShared = albumIds.map((albumId) => ({
			albumId,
			shared: getAlbumShared(albumId, profileId),
			revert: conversationState.lockSharedAlbum(albumId).revert,
		}));
		for (const albumId of albumIds)
			setAlbumShared(albumId, profileId, false);
		try {
			await Promise.all(
				albumIds.map((albumId) =>
					unshareAlbum({ albumId, profileIds: [profileId] }),
				),
			);
			toast.success(
				albumIds.length === 1 ? "Album unshared" : "Albums unshared",
			);
		} catch (err) {
			for (const { albumId, shared, revert } of wasShared) {
				revert();
				if (shared === undefined) forgetAlbumShared(albumId, profileId);
				else setAlbumShared(albumId, profileId, shared);
			}
			console.error(err);
			showErrorToast({ label: "Failed to unshare album", error: err });
		} finally {
			sharing = false;
		}
	}
</script>

<div class="@container/photo-grid flex flex-col rounded-grid">
	{#if error !== null}
		<div class="flex flex-1">
			<ApiErrorDisplay
				{error}
				onRetry={() => void load()}
				class="m-auto"
			/>
		</div>
	{:else if albums === null}
		<div
			class="photo-grid [--photo-grid-aspect:3/4]"
			data-grid-columns={getAlbumGridColumnsSnapshot()}
		>
			{#each Array(9)}
				<Skeleton class="aspect-(--photo-grid-aspect) rounded-none" />
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
					Albums you create appear here, ready to share.
				</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else}
		<div
			class="photo-grid [--photo-grid-aspect:3/4]"
			data-grid-columns={getAlbumGridColumnsSnapshot()}
		>
			{#each albums as album (album.albumId)}
				{@const isSelected = selected.has(album.albumId)}
				{@const isShared = sharedAlbumIds.has(album.albumId)}
				{@const hasVideo = album.content.some((item) =>
					item.contentType.startsWith("video/"),
				)}
				<button
					type="button"
					data-slot="album-tile"
					class={[
						"relative isolate flex aspect-(--photo-grid-aspect) items-end overflow-hidden",
						{
							"cursor-pointer":
								album.isShareable &&
								(selected.canSelectMore || isSelected),
						},
					]}
					aria-pressed={isSelected}
					disabled={!album.isShareable}
					onclick={() => toggleSelected(album.albumId)}
				>
					<MediaImage
						src={proxyMediaUrl(album.content[0]?.thumbUrl)}
						loading="lazy"
						class="absolute inset-0 size-full rounded-[inherit]"
						imgClass="bg-card-foreground/10"
					/>
					<div class="z-1 flex w-full items-center p-1.5">
						<Badge
							variant="outline"
							class="min-w-0 bg-popover/20 backdrop-blur-2xl"
						>
							<span class="truncate font-semibold">
								{album.albumName || "Untitled album"}
							</span>
						</Badge>
					</div>
					<div
						class="absolute inset-s-1.5 top-1.5 z-1 flex gap-1 text-2xs font-semibold *:flex *:h-6 *:min-w-6 *:items-center *:justify-center *:gap-1 *:rounded-full *:border *:border-white/10 *:bg-popover/40 *:backdrop-blur-2xl"
					>
						<div class="px-1.5">
							<ImagesIcon weight="fill" class="size-3.5" />
							{album.content.length}<span class="sr-only">
								{album.content.length === 1 ? "item" : "items"}
							</span>
						</div>
						{#if hasVideo}
							<div>
								<VideoIcon weight="fill" class="size-3.5" />
								<span class="sr-only">contains video</span>
							</div>
						{/if}
						{#if isShared}
							<div class="px-1.5">
								Shared<span class="sr-only">
									with this person already
								</span>
							</div>
						{/if}
					</div>
					{#if isSelected}
						<div
							class="absolute inset-0 z-2 flex items-center justify-center rounded-[inherit] bg-primary/50 outline-2 -outline-offset-2 outline-primary"
						>
							<SelectionCheck />
						</div>
					{:else if !album.isShareable}
						<div
							class="absolute inset-0 z-2 flex items-center justify-center rounded-[inherit] bg-black/60 text-white"
						>
							<LockSimpleIcon weight="fill" class="size-6" />
							<span class="sr-only">can't be shared</span>
						</div>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
	<div role="status" class="sr-only">
		{selected.size === selected.max
			? `Maximum ${selected.max} selected`
			: ""}
	</div>
</div>
