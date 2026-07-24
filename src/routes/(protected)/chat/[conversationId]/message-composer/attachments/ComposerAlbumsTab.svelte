<script lang="ts">
	import EyeSlashIcon from "phosphor-svelte/lib/EyeSlashIcon";
	import FolderOpenIcon from "phosphor-svelte/lib/FolderOpenIcon";
	import ImageBrokenIcon from "phosphor-svelte/lib/ImageBrokenIcon";
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
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import * as Empty from "$lib/components/ui/empty";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import {
		AlbumExpiration,
		type AlbumExpirationType,
		type MyAlbum,
	} from "$lib/model/messaging/albums";
	import { getConversationState } from "../../conversation-state.svelte";

	// Expiry choices offered when sharing, ordered to match the official app.
	// Keyed by `AlbumExpiration` so adding an option fails the typecheck until it
	// is labelled here.
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
	let busyAlbumId = $state<number | null>(null);

	// Derived from the shared record so reopening the sheet shows what is already
	// known; share/unshare only have to write to the record.
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

	async function share(albumId: number, expirationType: AlbumExpirationType) {
		if (recipientId === null || busyAlbumId !== null) return;
		busyAlbumId = albumId;
		try {
			await shareAlbum({ albumId, profileIds: [recipientId], expirationType });
			setAlbumShared(albumId, recipientId, true);
			onClose();
			toast.success("Album shared");
		} catch (err) {
			console.error(err);
			showErrorToast({ label: "Failed to share album", error: err });
		} finally {
			busyAlbumId = null;
		}
	}

	async function unshare(albumId: number) {
		if (recipientId === null || busyAlbumId !== null) return;
		busyAlbumId = albumId;
		try {
			await unshareAlbum({ albumId, profileIds: [recipientId] });
			setAlbumShared(albumId, recipientId, false);
			toast.success("Album unshared");
		} catch (err) {
			console.error(err);
			showErrorToast({ label: "Failed to unshare album", error: err });
		} finally {
			busyAlbumId = null;
		}
	}
</script>

<div class="@container/photo-grid flex flex-col rounded-grid">
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
				{@const isShared = sharedAlbumIds.has(album.albumId)}
				{@const cover =
					album.content[0]?.coverUrl || album.content[0]?.thumbUrl}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger disabled={busyAlbumId !== null}>
						{#snippet child({ props: { class: className, ...props } })}
							<button
								{...props}
								type="button"
								class={[className, "relative aspect-3/4"]}
								aria-label={isShared ? "Unshare album" : "Share album"}
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
											color="var(--color-neutral-600)"
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
								{#if isShared}
									<span
										class="pointer-events-none absolute top-1.5 left-1.5 rounded-full bg-primary/90 px-2 py-0.5 text-xs font-medium text-primary-foreground"
									>
										Shared
									</span>
								{/if}
							</button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content class="w-44" align="start">
						{#if isShared}
							<DropdownMenu.Item onSelect={() => void unshare(album.albumId)}>
								<EyeSlashIcon class="size-5" />
								Unshare album
							</DropdownMenu.Item>
						{:else}
							<DropdownMenu.Label>Share album for…</DropdownMenu.Label>
							{#each EXPIRATION_OPTIONS as option (option.value)}
								<DropdownMenu.Item
									onSelect={() => void share(album.albumId, option.value)}
								>
									{option.label}
								</DropdownMenu.Item>
							{/each}
						{/if}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/each}
		</div>
	{/if}
</div>
