import z from "zod";

// Grindr only says which message was read, so the read time is when its
// receipt reached us.
const KEY_PREFIX = "chat:peer-read-times:";
const MAX_ENTRIES = 500;

const entrySchema = z.object({ timestamp: z.number(), readAt: z.number() });
const storedSchema = z.record(z.string(), entrySchema);

type Entry = z.infer<typeof entrySchema>;

const keyFor = (profileId: number) => `${KEY_PREFIX}${profileId}`;

function load(profileId: number): Record<string, Entry> {
	try {
		const raw = localStorage.getItem(keyFor(profileId));
		return raw === null
			? {}
			: (storedSchema.safeParse(JSON.parse(raw)).data ?? {});
	} catch {
		return {};
	}
}

export function clearStoredPeerReadTimes(profileId: number): void {
	if (typeof localStorage === "undefined") return;
	localStorage.removeItem(keyFor(profileId));
}

export class PeerReadTimes {
	#entries: Record<string, Entry> = $state({});
	#profileId: number;

	constructor({ profileId }: { profileId: number }) {
		this.#profileId = profileId;
		if (typeof localStorage !== "undefined")
			this.#entries = load(profileId);
	}

	record({
		conversationId,
		timestamp,
		readAt,
	}: {
		conversationId: string;
		timestamp: number;
		readAt: number;
	}): void {
		const known = this.#entries[conversationId];
		if (known && known.timestamp >= timestamp) return;
		this.#entries[conversationId] = { timestamp, readAt };
		this.#save();
	}

	/** When the message at `timestamp` was seen read, if we saw it happen. */
	readAt({
		conversationId,
		timestamp,
	}: {
		conversationId: string;
		timestamp: number | null;
	}): number | null {
		const known = this.#entries[conversationId];
		return known && known.timestamp === timestamp ? known.readAt : null;
	}

	#save(): void {
		if (typeof localStorage === "undefined") return;
		const kept = Object.entries($state.snapshot(this.#entries))
			.sort(([, a], [, b]) => b.readAt - a.readAt)
			.slice(0, MAX_ENTRIES);
		try {
			localStorage.setItem(
				keyFor(this.#profileId),
				JSON.stringify(Object.fromEntries(kept)),
			);
		} catch (error) {
			console.error(error);
		}
	}
}
