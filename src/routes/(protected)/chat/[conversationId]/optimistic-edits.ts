import type { OptimisticMessage } from "./merge-messages";

/** Undoes the edit when the request it was made ahead of fails. */
export type Revert = { revert: () => void };

const ALBUM_TYPES = ["Album", "ExpiringAlbum", "ExpiringAlbumV2"];

/**
 * Shows a message as unsent before the server confirms it. The inbox preview
 * follows only when the message is the latest one, since that is the only one
 * the row is showing.
 */
export function unsendInPlace({
	messages,
	messageId,
	sync,
	refreshPreview,
}: {
	messages: OptimisticMessage[];
	messageId: string;
	sync: () => void;
	refreshPreview: (message: OptimisticMessage) => void;
}): Revert {
	const isLatest = messages.at(0)?.messageId === messageId;
	const message = messages.find((m) => m.messageId === messageId);
	if (!message) return { revert: () => {} };

	const original = {
		unsent: message.unsent,
		type: message.type,
		body: message.body,
	};
	const applied = () => {
		sync();
		if (isLatest) refreshPreview(message);
	};
	message.unsent = true;
	message.type = "Unsent";
	message.body = null;
	applied();

	return {
		revert: () => {
			message.unsent = original.unsent;
			message.type = original.type;
			message.body = original.body;
			applied();
		},
	};
}

/**
 * Locks our own album bubbles for `albumId` in place after the album is
 * unshared, so the recipient can no longer view them. The backend keeps
 * historical messages, so a refresh would still show them as shared — local
 * state is updated instead.
 */
export function lockSharedAlbumInPlace({
	messages,
	albumId,
	ourProfileId,
	sync,
}: {
	messages: OptimisticMessage[];
	albumId: number;
	ourProfileId: number;
	sync: () => void;
}): Revert {
	const affected = messages.filter(
		(m) =>
			m.senderId === ourProfileId &&
			!m.unsent &&
			ALBUM_TYPES.includes(m.type) &&
			(m.body as { albumId: number } | null)?.albumId === albumId,
	);
	const previous = affected.map((m) => ({
		body: m.body as { isViewable: boolean },
		wasViewable: (m.body as { isViewable: boolean }).isViewable,
	}));
	for (const { body } of previous) body.isViewable = false;
	if (previous.length > 0) sync();

	return {
		revert: () => {
			for (const { body, wasViewable } of previous)
				body.isViewable = wasViewable;
			if (previous.length > 0) sync();
		},
	};
}
