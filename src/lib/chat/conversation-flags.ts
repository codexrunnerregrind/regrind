import { applyOptimisticBatch } from "$lib/chat/optimistic-batch";
import type { Conversation } from "$lib/model/messaging/conversations";
import type { PendingFlags } from "./pending-flags";

/** The conversation flags a row can turn on and off without leaving the list. */
export type OptimisticFlagField = "pinned" | "muted";

/**
 * Turn a flag on or off across conversations, on screen first and on the server
 * after, rolling the rows back if the requests fail.
 *
 * While a request is in flight the field is marked pending, so a fetch landing
 * mid-flight merges the server's older value over what the user just chose.
 */
export async function setConversationFlag({
	conversationIds,
	field,
	value,
	request,
	errorLabel,
	find,
	pendingFlags,
	sort,
}: {
	conversationIds: string[];
	field: OptimisticFlagField;
	value: boolean;
	request: (conversationId: string) => Promise<unknown>;
	errorLabel: string;
	find: (conversationId: string) => Conversation | undefined;
	pendingFlags: PendingFlags<OptimisticFlagField>;
	sort: () => void;
}): Promise<void> {
	const targets = conversationIds
		.map((id) => find(id))
		.filter(
			(entry): entry is Conversation =>
				entry !== undefined && entry.data[field] !== value,
		);
	if (targets.length === 0) return;
	for (const entry of targets) {
		entry.data[field] = value;
		pendingFlags.mark({ conversationId: entry.data.conversationId, field });
	}
	if (field === "pinned") sort();

	try {
		const rolledBack = await applyOptimisticBatch({
			items: targets,
			request: (entry) => request(entry.data.conversationId),
			rollback: (entry) => {
				entry.data[field] = !value;
			},
			errorLabel,
		});
		if (rolledBack) sort();
	} finally {
		for (const entry of targets) {
			pendingFlags.unmark({
				conversationId: entry.data.conversationId,
				field,
			});
		}
	}
}
