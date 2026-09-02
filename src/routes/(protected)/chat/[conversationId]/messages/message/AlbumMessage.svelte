<script lang="ts">
	import {
		ClockIcon,
		ImageBrokenIcon,
		ImagesIcon,
		VideoIcon,
	} from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import { getAlbumShared } from "$lib/api/messaging/album-shares-state.svelte";
	import {
		AlbumLockedError,
		type AlbumSharer,
		type LoadedAlbum,
		openAlbumLightbox,
		resolveAlbumForViewing,
	} from "$lib/chat/album-viewer";
	import { myAlbumCoverUrl } from "$lib/chat/my-albums";
	import { paywallCoverUrl } from "$lib/chat/paywall-covers";
	import LockIcon from "$lib/components/shared/LockIcon.svelte";
	import { profileMediaUrl } from "$lib/util/media";
	import { getNow } from "$lib/util/now";
	import type { AlbumMessage } from "$lib/model/messaging/messages";
	import { getConversationState } from "../../conversation-state.svelte";
	import { albumExpiry } from "./album-expiry";
	import { getMessageContext } from "./context";
	import LockedMedia from "./LockedMedia.svelte";
	import { MessageMediaState } from "./message-media.svelte";

	const ALBUM_MEMO_TTL_MS = 10 * 60 * 1000;

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

	// An album bubble we sent is one of our own albums — an album can only be
	// shared by whoever owns it. The direction of the message is what says so:
	// the body's `ownerProfileId` is not always filled in, and a bubble of ours
	// that came back without one was being treated as somebody else's, which is
	// what sent a revoked share off to the paywall teaser and had it report our
	// own album as locked or expired.
	const { isOut } = $derived(getMessageContext()());
	const isOurs = $derived(
		isOut || message.ownerProfileId === conversation.ourProfileId,
	);

	// `isViewable` is a snapshot from when the message was sent, so a share
	// granted or revoked anywhere else — the composer's albums tab, the album's
	// own shares screen — leaves the bubble saying the opposite of the truth.
	// The share state those surfaces write is the live answer, and it only
	// speaks for our own albums: whether somebody else still shares theirs is
	// not something we are told. Unknown falls back to the snapshot.
	const sharedWithPeer = $derived.by(() => {
		if (!isOurs) return undefined;
		const profileId = conversation.profile?.profileId;
		if (profileId === undefined) return undefined;
		return getAlbumShared(message.albumId, profileId);
	});
	const isViewable = $derived(sharedWithPeer ?? message.isViewable);

	// Someone else's album gets the viewer's reply chrome; our own share opens
	// bare. The conversation partner is the sharer, so its profile is what the
	// header describes.
	const sharer = $derived.by<AlbumSharer | undefined>(() => {
		if (isOurs) return undefined;
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

	// A locked bubble still has something to show, so it shows it rather than a
	// bare lock plate: the paywall teaser's blurred cover for somebody else's
	// album, and for one of ours the album's own cover — a share we revoked is
	// locked for them, not for us. The message's `coverUrl` stands in until that
	// lands, and only as long as the signature it was sent with holds.
	let freshCover = $state<string | null>(null);
	let coverBroken = $state(false);

	// Somebody else's locked album is the case where the sent-with signature has
	// almost always lapsed, and the browser takes seconds to give up on the dead
	// url — long enough to show a cover-and-corner-badge bubble that then turns
	// into a lock plate. Its stale url is skipped, so the lock stands from the
	// first frame and the teaser's cover replaces it once it lands.
	const staleCover = $derived(!isViewable && !isOurs);

	const preview = $derived(
		freshCover ?? (coverBroken || staleCover ? null : message.coverUrl),
	);

	$effect(() => {
		// A viewable bubble's own cover is current; only a locked one needs asking.
		if (isViewable) return;
		const { albumId, ownerProfileId } = message;
		const ours = isOurs;
		let cancelled = false;
		void (
			ours
				? myAlbumCoverUrl(albumId)
				: paywallCoverUrl({ albumId, ownerProfileId })
		)
			.then((url) => {
				if (!cancelled && url !== null) freshCover = url;
			})
			// A cover we cannot reach just leaves the lock plate up.
			.catch((error: unknown) => {
				console.error(error);
			});
		return () => {
			cancelled = true;
		};
	});

	let phase = $state<"idle" | "loading" | "open">("idle");
	// Reopening the same album shouldn't refetch it, but only for a while: the
	// media urls are signed and short-lived, and the owner can add or drop
	// slides meanwhile. A share flipping does not stale it: only our own albums
	// can flip here, and those resolve to the same full album whether the share
	// is on or off — it is a stranger's bubble that would come from the teaser,
	// and we are never told when one of those changes.
	let cachedAlbum: LoadedAlbum | null = null;
	let cachedAt = 0;
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
			const fresh = getNow() - cachedAt < ALBUM_MEMO_TTL_MS;
			if (cachedAlbum === null || !fresh) {
				// Somebody else's locked bubble says so on its face, so there is no
				// point asking for an album the API will refuse: go straight to the
				// teaser. One of ours is a different kind of locked — the share is
				// off, but the album is still ours to open in full.
				const resolved = await resolveAlbumForViewing({
					albumId: message.albumId,
					ownerProfileId: message.ownerProfileId,
					// `ours` covers a locked bubble of ours, so there is no
					// point spending a request on the viewer endpoint that
					// would only refuse it.
					viewable: isViewable,
					ours: isOurs,
				});
				cachedAlbum = resolved.album;
				cachedFromPaywall = resolved.fromPaywall;
				cachedAt = getNow();
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
	aria-label={isViewable ? "Open album" : "Open locked album"}
	onclick={() => void openAlbum()}
	disabled={phase !== "idle"}
	{@attach media.attach}
>
	{#if preview !== null}
		<img
			src={preview}
			alt=""
			class="chat-media-tint absolute top-0 left-0 h-full w-full rounded-[inherit] object-cover"
			draggable="false"
			onerror={() => {
				coverBroken = true;
			}}
		/>
	{:else if isViewable}
		<div
			class="chat-media-tint-strong flex size-full items-center justify-center rounded-[inherit]"
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
		{#if !isViewable && preview !== null}
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
		{#if isViewable || preview !== null}
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
