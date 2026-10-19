<script lang="ts">
	import PlayIcon from "phosphor-svelte/lib/PlayIcon";
	import VideoIcon from "phosphor-svelte/lib/VideoIcon";

	import { showErrorToast } from "$lib/api/error-toast";
	import { getSingleMessage } from "$lib/api/messaging/messages";
	import { openVideoLightbox } from "$lib/chat/video-viewer";
	import { VIDEO_MESSAGE_TYPES } from "$lib/model/messaging/message-preview";
	import {
		apiResponseMessageSchema,
		draftFromMessage,
	} from "$lib/model/messaging/messages";
	import { profileMediaUrl } from "$lib/util/media";
	import { getConversationState } from "../../conversation-state.svelte";
	import LockedMedia from "./LockedMedia.svelte";
	import { MessageMediaState } from "./message-media.svelte";

	// The reaction the double-tap on a message bubble sends, mirrored here so the
	// viewer's 🔥 lands as the same reaction.
	const FIRE_REACTION = 1;

	let {
		conversationId,
		messageId,
		message,
	}: {
		conversationId: string;
		messageId: string;
		// The three video message bodies overlap only in these fields; the rest
		// (view counters, expiry) differ per variant and is read defensively.
		message: {
			url?: string | null;
			contentType?: string | null;
			looping?: boolean | null;
			maxViews?: number | null;
			viewsRemaining?: number | null;
		};
	} = $props();

	const media = new MessageMediaState();
	const conversation = $derived(getConversationState()());
	const isOurs = $derived(
		conversation.messages.find((m) => m.messageId === messageId)
			?.senderId === conversation.ourProfileId,
	);

	const className: import("svelte/elements").ClassValue = $derived([
		"relative",
		{ "w-3/5 max-w-60 min-w-40": !media.clone, "size-full": media.clone },
	]);

	const contentClass: import("svelte/elements").ClassValue = $derived([
		"rounded-xl",
		media.cornerClass,
	]);

	// The url the bubble has already been opened with. A view-once video's own
	// body loses its url once the view is spent, so without this the bubble would
	// fall back to "View video" and a second tap would ask the API for a url it
	// no longer has. Kept whether it came from the body or from the fetch below,
	// so re-opening one costs no further view.
	let seenUrl = $state<string | null>(null);
	let loading = $state(false);
	let aspectRatio = $state<string | null>(null);
	const url = $derived(seenUrl ?? message.url ?? null);

	// A clip we have already opened stays playable on the counter running out —
	// the view it cost is spent either way.
	const spent = $derived(
		seenUrl === null &&
			message.viewsRemaining !== undefined &&
			message.viewsRemaining !== null &&
			message.viewsRemaining <= 0,
	);

	let teardown: (() => void) | null = null;

	$effect(() => () => {
		teardown?.();
		teardown = null;
	});

	// Same bar as a photo: theirs can be replied to and reacted to, ours is
	// browse-only.
	function chromeFor() {
		const profile = conversation.profile;
		if (isOurs) {
			return {
				header: { fallbackName: "You", subtitle: "Video" },
				actions: {},
			};
		}
		return {
			header: {
				profileId: profile?.profileId,
				name: profile?.name,
				fallbackName: "Video",
				avatarUrl:
					profile?.mediaHash === undefined ||
					profile.mediaHash === null
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
			},
			actions: {
				onReply: (text: string) => {
					const target = conversation.messages.find(
						(m) => m.messageId === messageId,
					);
					if (target) conversation.setReplyTo(target);
					conversation.send([
						draftFromMessage({ type: "Text", body: { text } }),
					]);
					return Promise.resolve();
				},
				onReact: async () => {
					await conversation.reactTo({
						messageId,
						reactionType: FIRE_REACTION,
					});
				},
			},
		};
	}

	// The viewer rather than the bubble's own <video>: the webview's native
	// controls carry no way to save the clip, and the media viewer does.
	async function openViewer(src: string) {
		teardown?.();
		teardown = null;
		teardown = await openVideoLightbox(
			{
				url: src,
				mimeType: message.contentType,
				looping: message.looping,
			},
			{
				chrome: chromeFor(),
				onClosed: () => {
					teardown?.();
					teardown = null;
				},
			},
		);
	}

	async function openVideo() {
		if (loading) return;
		loading = true;
		try {
			let src = url;
			if (src === null) {
				const fetched = await getSingleMessage({
					conversationId,
					messageId,
				})
					.then((res) => apiResponseMessageSchema.parse(res.message))
					.then((parsed) =>
						VIDEO_MESSAGE_TYPES.includes(parsed.type)
							? (parsed.body as {
									url?: string | null;
									viewsRemaining?: number | null;
								})
							: null,
					);
				src = fetched?.url ?? null;
				// The fetch is what spends a view, so its count is the one worth
				// keeping — the conversation payload still carries the count from
				// when the message arrived. A clip with no url left has none;
				// one without a view limit has nothing to count down.
				const viewsRemaining =
					src === null
						? 0
						: message.maxViews === null ||
							  message.maxViews === undefined
							? null
							: (fetched?.viewsRemaining ?? 0);
				if (viewsRemaining !== null) {
					conversation.recordMediaViews({
						messageId,
						viewsRemaining,
					});
				}
				// Nothing left to play. The bubble says so itself rather than
				// reporting a spent view as an error.
				if (src === null) return;
			}
			seenUrl = src;
			await openViewer(src);
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to load video", error });
		} finally {
			loading = false;
		}
	}
</script>

{#if spent}
	<!-- Matches the expired-image placeholder: nothing left to show, so the
	     bubble shrinks to a one-line notice rather than holding open a frame. -->
	<div class={["h-12", className, contentClass]} {@attach media.attach}>
		<LockedMedia
			class={[
				media.cornerClass,
				"gap-2 font-medium text-media-placeholder-foreground",
			]}
			size="sm"
		>
			Expired video
		</LockedMedia>
		{@render media.adornments?.()}
	</div>
{:else if url !== null}
	<div class={className} {@attach media.attach}>
		<button
			type="button"
			class="block w-full cursor-pointer"
			aria-label="Play video"
			onclick={() => void openVideo()}
		>
			<video
				src={url}
				muted
				playsinline
				preload="metadata"
				class={["w-full bg-black object-contain", contentClass]}
				style:aspect-ratio={aspectRatio ?? "3 / 4"}
				onloadedmetadata={(event) => {
					const { videoWidth, videoHeight } = event.currentTarget;
					// Portrait or landscape isn't known until the metadata lands, so the
					// bubble starts at the usual media 3:4 and takes the real shape once
					// it does — no cropping either way.
					if (videoWidth > 0 && videoHeight > 0) {
						aspectRatio = `${videoWidth} / ${videoHeight}`;
					}
				}}
			></video>
			<!-- The bubble shows a still frame, so it has to say there is a
			     video behind it. -->
			<span
				class="pointer-events-none absolute inset-0 flex items-center justify-center"
			>
				<span
					class="flex size-11 items-center justify-center rounded-full bg-plate-strong text-plate-foreground"
				>
					<PlayIcon size={22} weight="fill" />
				</span>
			</span>
		</button>
		{@render media.adornments?.()}
	</div>
{:else}
	<button
		class={[
			"flex items-center gap-2 px-4 py-3 text-start font-medium",
			"border border-border bg-input",
			className,
			contentClass,
			{ "opacity-50": loading, "cursor-pointer": !loading },
		]}
		onclick={() => void openVideo()}
		disabled={loading}
		{@attach media.attach}
	>
		<VideoIcon size={24} weight="fill" class="shrink-0" />
		<span class="min-w-0 truncate">
			{message.maxViews === null || message.maxViews === undefined
				? "Load video"
				: "View video"}
		</span>
		{@render media.adornments?.()}
	</button>
{/if}
