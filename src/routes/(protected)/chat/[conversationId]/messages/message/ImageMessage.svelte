<script lang="ts">
	import { showErrorToast } from "$lib/api/error-toast";
	import { openImageGalleryLightbox } from "$lib/chat/image-gallery";
	import TakenOnGrindrBadge from "$lib/components/media/TakenOnGrindrBadge.svelte";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import { draftFromMessage } from "$lib/model/messaging/messages";
	import { profileMediaUrl } from "$lib/util/media";
	import type {
		MediaViewerActions,
		MediaViewerHeader,
	} from "$lib/chat/media-viewer-chrome";
	import type { ImageMessage } from "$lib/model/messaging/messages";
	import { getConversationState } from "../../conversation-state.svelte";
	import { MessageMediaState } from "./message-media.svelte";

	// The reaction the double-tap on a message bubble sends, mirrored here so the
	// viewer's 🔥 lands as the same reaction.
	const FIRE_REACTION = 1;

	let {
		message,
		messageId,
	}: { message: ImageMessage["body"]; messageId: string } = $props();

	const media = new MessageMediaState();

	const conversationState = $derived(getConversationState()());

	// Every loose image in the conversation, oldest-first to match the visual
	// order, tagged with its sender so the gallery can stay on one side.
	const images = $derived(
		conversationState.messages
			.filter((m) => m.type === "Image")
			.map((m) => ({
				messageId: m.messageId,
				senderId: m.senderId,
				url: m.body.url,
				width: m.body.width,
				height: m.body.height,
				takenOnGrindr: m.body.takenOnGrindr,
				createdAt: m.body.createdAt,
			}))
			.reverse(),
	);

	let failedSrc: string | null = $state(null);
	const failed = $derived(failedSrc === message.url);

	// The API leaves width and height out often enough that it cannot be relied
	// on, and an <img> with no ratio and an auto height occupies nothing until it
	// decodes — a screenful of photos then grows out of nowhere and shoves the
	// conversation around, worst of all while older pages are loading in. So the
	// bubble stands at a portrait placeholder until the photo reports its own
	// shape, and only the difference between the two ever moves.
	const PLACEHOLDER_RATIO = "3 / 4";
	let naturalRatio: string | null = $state(null);
	const aspectRatio = $derived(
		message.width !== null && message.height !== null
			? `${message.width} / ${message.height}`
			: (naturalRatio ?? PLACEHOLDER_RATIO),
	);

	let teardown: (() => void) | undefined;

	// Their photos get the reply bar; our own side is browse-only, since there is
	// nobody to reply to and the API only reacts to incoming messages.
	function chromeFor(
		sideImages: typeof images,
		theirs: boolean,
	): { header: MediaViewerHeader; actions: MediaViewerActions } {
		const profile = conversationState.profile;
		if (!theirs) {
			return {
				header: {
					fallbackName: "You",
					subtitle: `${sideImages.length} ${sideImages.length === 1 ? "photo" : "photos"}`,
				},
				actions: {},
			};
		}
		return {
			header: {
				profileId: profile?.profileId,
				name: profile?.name,
				fallbackName: "Photos",
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
				// A reply to a photo is an ordinary message quoting it, the same as
				// replying from the bubble's context menu.
				onReply: (text, index) => {
					const target = conversationState.messages.find(
						(m) => m.messageId === sideImages[index]?.messageId,
					);
					if (target) conversationState.setReplyTo(target);
					conversationState.send([
						draftFromMessage({ type: "Text", body: { text } }),
					]);
					return Promise.resolve();
				},
				onReact: async (index) => {
					const target = sideImages[index];
					if (!target) return;
					await conversationState.reactTo({
						messageId: target.messageId,
						reactionType: FIRE_REACTION,
					});
				},
			},
		};
	}

	function openGallery(event: MouseEvent) {
		event.preventDefault();
		// Only swipe through images from the same side as the tapped one: open a
		// received pic and you browse received pics; open one you sent and you
		// browse the ones you sent.
		const tapped = images.find((i) => i.messageId === messageId);
		const sideImages = images.filter(
			(i) => i.senderId === tapped?.senderId,
		);
		const startIndex = sideImages.findIndex(
			(i) => i.messageId === messageId,
		);
		teardown?.();
		teardown = undefined;
		openImageGalleryLightbox(sideImages, {
			startIndex: startIndex < 0 ? 0 : startIndex,
			chrome: chromeFor(
				sideImages,
				tapped?.senderId !== conversationState.ourProfileId,
			),
			onClosed: () => {
				teardown?.();
				teardown = undefined;
			},
		})
			.then((destroy) => {
				teardown = destroy;
			})
			.catch((error) => {
				console.error(error);
				showErrorToast({ label: "Failed to open image", error });
			});
	}

	$effect(() => () => teardown?.());
</script>

<div
	class={["relative", { "w-2/5 max-w-60 min-w-35": !media.clone }]}
	{@attach media.attach}
>
	<a
		href={failed ? undefined : message.url}
		rel="noreferrer"
		aria-label="Open image"
		aria-disabled={failed ? "true" : undefined}
		class="item block"
		onclick={openGallery}
	>
		<MediaImage
			src={message.url}
			class={["w-full rounded-lg", media.cornerClass]}
			imgClass="chat-media-tint"
			{aspectRatio}
			onload={(image) => {
				if (image.naturalHeight > 0) {
					naturalRatio = `${image.naturalWidth} / ${image.naturalHeight}`;
				}
			}}
			bind:failedSrc
		/>
		{#if message.takenOnGrindr}
			<!-- Bottom corner: the reactions hang off the top one. Inside the
			     link, so a tap on it opens the photo like any other. -->
			<TakenOnGrindrBadge
				createdAt={message.createdAt}
				class="absolute start-1.5 bottom-1.5"
			/>
		{/if}
	</a>
	{@render media.adornments?.()}
</div>

<style>
	:global(.pswp__img) {
		object-fit: contain;
	}
</style>
