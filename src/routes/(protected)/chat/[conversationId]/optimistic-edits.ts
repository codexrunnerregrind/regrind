import { type OptimisticMessage, previewedMessage } from "./merge-messages";

/** Undoes the edit when the request it was made ahead of fails. */
export type Revert = { revert: () => void };

const ALBUM_TYPES = ["Album", "ExpiringAlbum", "ExpiringAlbumV2"];

/**
 * Shows a message as unsent before the server confirms it. The inbox preview
 * follows only when the message is the one the row is showing.
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
	const isLatest = previewedMessage(messages)?.messageId === messageId;
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

/**
 * Writes back what a single-message fetch reported about an expiring clip's
 * remaining views. The conversation payload carries the count from when the
 * message arrived, so a clip whose views are gone still reads as viewable and
 * the bubble only learns otherwise by asking. Recording it here — and caching
 * it — means it is asked at most once.
 */
export function recordMediaViewsInPlace({
	messages,
	messageId,
	viewsRemaining,
	sync,
}: {
	messages: OptimisticMessage[];
	messageId: string;
	viewsRemaining: number;
	sync: () => void;
}): void {
	const message = messages.find((m) => m.messageId === messageId);
	const body = message?.body as { viewsRemaining?: number | null } | null;
	if (!body || body.viewsRemaining === viewsRemaining) return;
	body.viewsRemaining = viewsRemaining;
	sync();
}
