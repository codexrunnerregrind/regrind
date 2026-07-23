<script lang="ts">
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error";
	import {
		getAlbumShared,
		setAlbumShared,
	} from "$lib/api/messaging/album-shares-state.svelte";
	import { unshareAlbum } from "$lib/api/messaging/albums";
	import {
		deleteMessageForMe,
		unsendMessage,
	} from "$lib/api/messaging/messages";
	import type { ApiResponseMessage } from "$lib/model/messaging/messages";
	import { getConversationState } from "../conversation-state.svelte";
	import { processMessages } from "../messages";
	import Message from "./message/Message.svelte";

	let {
		seenTimestamp = $bindable(),
	}: {
		seenTimestamp: number;
	} = $props();

	const conversationState = $derived(getConversationState()());

	const ALBUM_MESSAGE_TYPES = ["Album", "ExpiringAlbum", "ExpiringAlbumV2"];

	/**
	 * The album to offer unsharing for, or null when the message isn't an album
	 * we own. Keyed off ownerProfileId rather than who sent the message: a
	 * forwarded album is not ours to unshare.
	 */
	function albumIdToUnshare(message: ApiResponseMessage): number | null {
		if (!ALBUM_MESSAGE_TYPES.includes(message.type)) return null;
		const body = message.body as {
			albumId?: number;
			ownerProfileId?: number | null;
		};
		if (body.ownerProfileId !== conversationState.ourProfileId) return null;
		const albumId = body.albumId;
		if (albumId === undefined) return null;

		// The message is a snapshot from when it was sent and does not change when
		// the share is revoked, so drop the action once we know it is gone.
		// Unknown still offers it: the API tolerates unsharing what isn't shared,
		// and hiding it on a guess would strand a share that is still live.
		const profileId = conversationState.profile?.profileId;
		if (
			profileId !== undefined &&
			getAlbumShared(albumId, profileId) === false
		) {
			return null;
		}
		return albumId;
	}

	const messages = $derived(
		processMessages({
			messages: conversationState.messages,
			ourProfileId: conversationState.ourProfileId,
		}),
	);
</script>

{#each messages.toReversed() as message (message.messageId)}
	{@const isOut = message.senderId === conversationState.ourProfileId}
	<Message
		{message}
		{isOut}
		indexInStack={message.indexInStack}
		stackLength={message.stackLength}
		dayStart={message.dayStart}
		status={message.status}
		isRead={isOut && message.messageId === messages[0].messageId
			? conversationState.lastReadTimestamp === message.timestamp
			: null}
		onVisible={!isOut
			? () => {
					if (message.timestamp > seenTimestamp) {
						seenTimestamp = message.timestamp;
					}
					conversationState.reportRead(message);
				}
			: undefined}
		onDelete={async () => {
			let revert: (() => void) | undefined;
			try {
				({ revert } = conversationState.remove(message.messageId));
				await deleteMessageForMe({
					conversationId: conversationState.conversationId,
					messageId: message.messageId,
				});
			} catch (error) {
				console.error(error);
				showErrorToast({
					label: "Failed to delete message",
					error,
				});
				revert?.();
			}
		}}
		onReact={async (reactionType: number) => {
			try {
				await conversationState.reactTo(message.messageId, reactionType);
			} catch (error) {
				console.error(error);
				showErrorToast({
					label: "Failed to react to message",
					error,
				});
			}
		}}
		onUnsend={isOut && !message.unsent
			? async () => {
					let revert: (() => void) | undefined;
					try {
						({ revert } = conversationState.markMessageAsUnsent(
							message.messageId,
						));
						await unsendMessage({
							conversationId: conversationState.conversationId,
							messageId: message.messageId,
						});
					} catch (error) {
						console.error(error);
						showErrorToast({
							label: "Failed to unsend message",
							error,
						});
						revert?.();
					}
				}
			: undefined}
		onUnshareAlbum={albumIdToUnshare(message) !== null
			? async () => {
					const albumId = albumIdToUnshare(message);
					const profileId = conversationState.profile?.profileId;
					if (albumId === null || profileId === undefined) return;
					try {
						await unshareAlbum({ albumId, profileIds: [profileId] });
						setAlbumShared(albumId, profileId, false);
						toast.success("Album unshared");
					} catch (error) {
						console.error(error);
						showErrorToast({
							label: "Failed to unshare album",
							error,
						});
					}
				}
			: undefined}
	/>
{/each}
