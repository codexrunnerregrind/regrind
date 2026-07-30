<script lang="ts">
	import { DotsThreeIcon, ImageIcon } from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error";
	import { openImageGalleryLightbox } from "$lib/chat/image-gallery";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import { profileMediaUrl } from "$lib/util/media";
	import { getConversationState } from "../conversation-state.svelte";
	import { collectReceivedPhotos } from "./received-photos";
	import type { ReceivedPhoto } from "./received-photos";

	// The reaction the double-tap on a message bubble sends, mirrored here so the
	// viewer's 🔥 lands as the same reaction.
	const FIRE_REACTION = 1;

	let { profileId }: { profileId: number } = $props();

	const conversationState = $derived(getConversationState()());

	// Every photo here came from them, so the viewer gets the same header and
	// reply bar as tapping one of these photos in the conversation would.
	function chromeFor(photos: ReceivedPhoto[]) {
		const profile = conversationState.profile;
		return {
			header: {
				profileId: profile?.profileId ?? profileId,
				name: profile?.name,
				fallbackName: "Received photos",
				avatarUrl:
					profile?.mediaHash === undefined || profile.mediaHash === null
						? null
						: profileMediaUrl(profile.mediaHash, "thumb"),
				// The conversation profile reports metres, the viewer takes kilometres.
				distanceKm:
					profile?.distance === undefined || profile.distance === null
						? null
						: profile.distance / 1000,
			},
			actions: {
				onReply: (text: string, index: number) => {
					const target = photos[index]?.message;
					if (target) conversationState.setReplyTo(target);
					conversationState.send({ type: "Text", body: { text } });
					return Promise.resolve();
				},
				onReact: async (index: number) => {
					const target = photos[index]?.message;
					if (!target) return;
					await conversationState.reactTo(target.messageId, FIRE_REACTION);
				},
			},
		};
	}

	let teardown: (() => void) | undefined;
	let collecting = $state(false);

	async function openReceivedPhotos() {
		if (collecting) return;
		collecting = true;
		// The chat only holds the pages the user scrolled through, so scan the
		// rest of the history for image messages. Only the photos are kept — the
		// scanned messages are discarded rather than added to the chat.
		const toastId =
			conversationState.pageKey === null
				? undefined
				: toast.loading("Looking for received photos…");
		let receivedPhotos: ReceivedPhoto[];
		try {
			receivedPhotos = await collectReceivedPhotos({
				conversationId: conversationState.conversationId,
				profileId,
				loaded: conversationState.messages.filter((m) => m.status === "sent"),
				pageKey: conversationState.pageKey,
			});
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to load received photos", error });
			return;
		} finally {
			collecting = false;
			if (toastId !== undefined) toast.dismiss(toastId);
		}
		if (receivedPhotos.length === 0) {
			toast.info("No received photos yet");
			return;
		}
		teardown?.();
		teardown = undefined;
		openImageGalleryLightbox(receivedPhotos, {
			chrome: chromeFor(receivedPhotos),
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
				showErrorToast({ label: "Failed to open received photos", error });
			});
	}

	$effect(() => () => teardown?.());
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<button
				type="button"
				aria-label="Conversation menu"
				class="flex h-full w-14 shrink-0 items-center justify-center text-foreground"
				{...props}
			>
				<DotsThreeIcon size={26} weight="bold" />
			</button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content class="w-48" align="end">
		<DropdownMenu.Item onSelect={() => void openReceivedPhotos()}>
			<ImageIcon class="size-5" />
			Received photos
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
