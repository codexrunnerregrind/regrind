<script lang="ts">
	import { ImagesIcon } from "phosphor-svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import { getSingleMessage } from "$lib/api/messaging/messages";
	import { openImageGalleryLightbox } from "$lib/chat/image-gallery";
	import {
		type ExpiringImageMessage,
		expiringImageMessageSchema,
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
		message: ExpiringImageMessage["body"];
	} = $props();

	const media = new MessageMediaState();
	const conversation = $derived(getConversationState()());
	const isOurs = $derived(
		conversation.messages.find((m) => m.messageId === messageId)?.senderId ===
			conversation.ourProfileId,
	);

	const className: import("svelte/elements").ClassValue = $derived([
		"relative",
		{
			"size-full": media.clone,
		},
	]);

	const contentClass: import("svelte/elements").ClassValue = $derived([
		"rounded-xl",
		media.cornerClass,
	]);

	type LoadedImage = { url: string };

	let phase = $state<"idle" | "loading" | "open">("idle");
	// A view-once image is fetched once and kept: the view is already spent, so
	// re-opening it must not cost another one.
	let cachedImage: LoadedImage | null = null;
	let destroyLightbox: (() => void) | null = null;

	$effect(() => () => {
		destroyLightbox?.();
		destroyLightbox = null;
	});

	async function openImage() {
		if (phase !== "idle") return;
		phase = "loading";
		try {
			if (!cachedImage) {
				const { body: image } = await getSingleMessage({
					conversationId,
					messageId,
				}).then((res) => expiringImageMessageSchema.parse(res.message));
				if (image.url === null) throw new Error("Image URL is null");
				cachedImage = { url: image.url };
			}
			destroyLightbox = await openImageGalleryLightbox(
				[{ url: cachedImage.url, width: null, height: null }],
				{
					chrome: chromeFor(),
					onClosed: () => {
						phase = "idle";
						destroyLightbox = null;
					},
				},
			);
			phase = "open";
		} catch (error) {
			phase = "idle";
			console.error(error);
			showErrorToast({ label: "Failed to open expiring image", error });
		}
	}

	// Same bar as an ordinary photo: theirs can be replied to and reacted to,
	// ours is browse-only.
	function chromeFor() {
		const profile = conversation.profile;
		if (isOurs) {
			return {
				header: { fallbackName: "You", subtitle: "Expiring photo" },
				actions: {},
			};
		}
		return {
			header: {
				profileId: profile?.profileId,
				name: profile?.name,
				fallbackName: "Expiring photo",
				avatarUrl:
					profile?.mediaHash === undefined || profile.mediaHash === null
						? null
						: profileMediaUrl({ mediaHash: profile.mediaHash, size: "thumb" }),
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
					conversation.send({ type: "Text", body: { text } });
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
</script>

{#if message.viewsRemaining === null || message.viewsRemaining > 0}
	<button
		class={[
			"flex w-50 items-center gap-2 px-4 py-3 text-start font-medium",
			className,
			contentClass,
			"border border-border bg-input",
			{
				"cursor-pointer": phase === "idle",
				"opacity-50": phase === "loading",
			},
		]}
		onclick={() => void openImage()}
		disabled={phase !== "idle"}
		bind:this={media.el}
	>
		<ImagesIcon size={24} weight="fill" />
		<span>View expiring image</span>
		{@render media.adornments?.()}
	</button>
{:else}
	<div class={["h-12 w-50", className, contentClass]} bind:this={media.el}>
		<LockedMedia
			class={[
				media.cornerClass,
				"gap-2 font-medium text-media-placeholder-foreground",
			]}
			size="sm"
		>
			Expired image
		</LockedMedia>
		{@render media.adornments?.()}
	</div>
{/if}

<style>
	:global(.pswp__img) {
		object-fit: contain;
	}
</style>
