<script lang="ts">
	import { goto } from "$app/navigation";
	import { DotsThreeIcon, ImageIcon, ProhibitIcon } from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import { openImageGalleryLightbox } from "$lib/chat/image-gallery";
	import BlockProfileDialog from "$lib/components/profile/BlockProfileDialog.svelte";
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
				onReply: (text: string, index: number) => {
					const target = photos[index]?.message;
					if (target) conversationState.setReplyTo(target);
					conversationState.send({ type: "Text", body: { text } });
					return Promise.resolve();
				},
				onReact: async (index: number) => {
					const target = photos[index]?.message;
					if (!target) return;
					await conversationState.reactTo({
						messageId: target.messageId,
						reactionType: FIRE_REACTION,
					});
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
				loaded: conversationState.messages.filter(
					(m) => m.status === "sent",
				),
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
				showErrorToast({
					label: "Failed to open received photos",
					error,
				});
			});
	}

	let blockOpen = $state(false);

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
	<!-- Laid out as a row of tall icon-over-label targets, like the official app's
	     action strip: two stacked rows this short read as one cramped block. -->
	<DropdownMenu.Content class="flex w-auto min-w-fit gap-1 p-1.5" align="end">
		<DropdownMenu.Item
			class="w-22 flex-col gap-1.5 px-2 py-3 text-center text-caption leading-tight"
			onSelect={() => void openReceivedPhotos()}
		>
			<ImageIcon class="size-6" />
			Received photos
		</DropdownMenu.Item>
		<DropdownMenu.Item
			variant="destructive"
			class="w-22 flex-col gap-1.5 px-2 py-3 text-center text-caption leading-tight"
			onSelect={() => (blockOpen = true)}
		>
			<ProhibitIcon class="size-6" />
			Block
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>

<BlockProfileDialog
	bind:open={blockOpen}
	{profileId}
	name={conversationState.profile?.name ?? null}
	onBlocked={() => {
		// Their profile stops resolving once blocked, so the conversation view has
		// nothing left to show — leave it rather than sit on a broken header.
		void goto("/chat");
	}}
/>
