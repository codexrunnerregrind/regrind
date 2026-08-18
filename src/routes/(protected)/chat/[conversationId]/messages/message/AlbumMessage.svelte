<script lang="ts">
	import {
		ClockIcon,
		ImageBrokenIcon,
		ImagesIcon,
		VideoIcon,
	} from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		AlbumLockedError,
		type AlbumSharer,
		type LoadedAlbum,
		openAlbumLightbox,
		resolveAlbumForViewing,
	} from "$lib/chat/album-viewer";
	import { paywallCoverUrl } from "$lib/chat/paywall-covers";
	import LockIcon from "$lib/components/shared/LockIcon.svelte";
	import { profileMediaUrl } from "$lib/util/media";
	import { getNow } from "$lib/util/now";
	import type { AlbumMessage } from "$lib/model/messaging/messages";
	import { getConversationState } from "../../conversation-state.svelte";
	import { albumExpiry } from "./album-expiry";
	import LockedMedia from "./LockedMedia.svelte";
	import { MessageMediaState } from "./message-media.svelte";

	let { message }: { message: AlbumMessage["body"] } = $props();

	const media = new MessageMediaState();
	const conversation = $derived(getConversationState()());

	const expiry = $derived(albumExpiry(message, getNow()));

	const className: import("svelte/elements").ClassValue = $derived([
		"aspect-3/4 h-auto relative",
		{
			"ring ring-accent": message.hasUnseenContent,
			"w-2/5 min-w-35 max-w-60": !media.clone,
			"size-full": media.clone,
		},
	]);

	const contentClass: import("svelte/elements").ClassValue = $derived([
		"rounded-xl",
		media.cornerClass,
	]);

	// Someone else's album gets the viewer's reply chrome; our own share opens
	// bare. The conversation partner is the sharer, so its profile is what the
	// header describes.
	const sharer = $derived.by<AlbumSharer | undefined>(() => {
		if (message.ownerProfileId === conversation.ourProfileId)
			return undefined;
		const profile = conversation.profile;
		return {
			name: profile?.name,
			avatarUrl:
				profile?.mediaHash === undefined || profile.mediaHash === null
					? null
					: profileMediaUrl({
							mediaHash: profile.mediaHash,
							size: "thumb",
						}),
			// The conversation profile reports metres, the viewer takes kilometres.
			distanceKm:
				profile?.distance === undefined || profile.distance === null
					? null
					: profile.distance / 1000,
		};
	});

	// A locked album is still one somebody shared with us, and the paywall teaser
	// hands over its blurred cover — so the bubble shows that rather than a bare
	// lock plate. The message's own `coverUrl` is signed at send time and lapses
	// within the hour, so it only stands in until the fresh teaser url lands.
	let teaserCover = $state<string | null>(null);
	let coverBroken = $state(false);

	const preview = $derived(
		teaserCover ?? (coverBroken ? null : message.coverUrl),
	);

	$effect(() => {
		// Only somebody else's locked album: our own share we revoked is not in a
		// teaser being sold to us, and a viewable album needs nothing fetched.
		if (message.isViewable || sharer === undefined) return;
		const { albumId, ownerProfileId } = message;
		let cancelled = false;
		void paywallCoverUrl({ albumId, ownerProfileId })
			.then((url) => {
				if (!cancelled && url !== null) teaserCover = url;
			})
			// A teaser we cannot reach just leaves the lock plate up.
			.catch((error: unknown) => {
				console.error(error);
			});
		return () => {
			cancelled = true;
		};
	});

	let phase = $state<"idle" | "loading" | "open">("idle");
	// Reopening the same album shouldn't refetch it.
	let cachedAlbum: LoadedAlbum | null = null;
	// Set once the album came from the paywall teaser rather than the album
	// itself: those slides have no ids to reply or react to.
	let cachedFromPaywall = false;
	let destroyLightbox: (() => void) | null = null;

	// The message can scroll out of the list (or the conversation can be left)
	// while the viewer is open, so the lightbox is torn down with it.
	$effect(() => () => {
		destroyLightbox?.();
		destroyLightbox = null;
	});

	async function openAlbum() {
		if (phase !== "idle") return;
		phase = "loading";
		try {
			if (cachedAlbum === null) {
				// A locked bubble says so on its face, so there is no point asking
				// for an album the API will refuse: go straight to the teaser.
				const resolved = await resolveAlbumForViewing({
					albumId: message.albumId,
					ownerProfileId: message.ownerProfileId,
					viewable: message.isViewable,
				});
				cachedAlbum = resolved.album;
				cachedFromPaywall = resolved.fromPaywall;
			}
			destroyLightbox = await openAlbumLightbox(cachedAlbum, {
				sharer,
				fromPaywall: cachedFromPaywall,
				onClosed: () => {
					phase = "idle";
					destroyLightbox = null;
				},
			});
			phase = "open";
		} catch (error) {
			phase = "idle";
			if (error instanceof AlbumLockedError) {
				toast.info(error.message);
			} else {
				console.error(error);
				showErrorToast({ label: "Failed to open album", error });
			}
		}
	}
</script>

<!-- One bubble either way: a locked album is a button too, because the paywall
     teaser it appears in usually still hands over its media, so tapping is worth
     a try and falls back to the lock message when it isn't there. -->
<button
	class={[
		className,
		contentClass,
		{
			"cursor-pointer": phase === "idle",
			"opacity-50": phase === "loading",
		},
	]}
	aria-label={message.isViewable ? "Open album" : "Open locked album"}
	onclick={() => void openAlbum()}
	disabled={phase !== "idle"}
	{@attach media.attach}
>
	{#if preview !== null}
		<img
			src={preview}
			alt=""
			class="absolute top-0 left-0 h-full w-full rounded-[inherit] bg-card-foreground/10 object-cover"
			draggable="false"
			onerror={() => {
				coverBroken = true;
			}}
		/>
	{:else if message.isViewable}
		<div
			class="flex size-full items-center justify-center rounded-[inherit] bg-card-foreground/20"
		>
			<ImageBrokenIcon
				weight="fill"
				class="aspect-square h-auto w-8"
				color="var(--media-placeholder-foreground)"
			/>
		</div>
	{:else}
		<LockedMedia class={media.cornerClass} />
	{/if}
	<div class={["@container absolute top-0 left-0 size-full", contentClass]}>
		{#if expiry !== null}
			<div
				class={[
					"absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white",
					{
						"bg-destructive/80": expiry.expired,
						"bg-black/60": !expiry.expired,
					},
				]}
			>
				<ClockIcon weight="fill" class="size-3.5 shrink-0" />
				<span class="truncate">{expiry.label}</span>
			</div>
		{/if}
		{#if !message.isViewable && preview !== null}
			<!-- Over a preview the lock has to be said as its own plate, the way the
			     albums grid says it (AlbumTile.svelte): a glyph alone on top of a
			     cover reads as part of the photo rather than as the album's state. -->
			<span
				class="absolute top-2 right-2 flex size-6.5 items-center justify-center rounded-full bg-plate-strong text-plate-foreground"
				aria-label="Locked"
			>
				<LockIcon class="size-3.5" />
			</span>
		{/if}
		<!-- Centred in the cover: sitting a fifth up from the bottom read as a
		     misplaced badge rather than the album's own marker. Not over a bare
		     lock plate, though — a second glyph beside that one says nothing the
		     lock doesn't. -->
		{#if message.isViewable || preview !== null}
			<div
				class="absolute inset-0 flex items-center justify-center gap-1 px-2 py-0.5 *:aspect-square *:w-[20cqw] *:rounded-full *:bg-card *:p-2"
			>
				{#if message.hasPhoto}
					<div>
						<ImagesIcon
							width="100%"
							height="auto"
							weight="fill"
							color="var(--color-neutral-200)"
						/>
					</div>
				{/if}
				{#if message.hasVideo}
					<div>
						<VideoIcon
							width="100%"
							height="auto"
							weight="fill"
							color="var(--color-neutral-200)"
						/>
					</div>
				{/if}
			</div>
		{/if}
	</div>
	{@render media.adornments?.()}
</button>

<style>
	:global(.pswp__img) {
		object-fit: contain;
	}
</style>
