import { tick } from "svelte";
import z from "zod";

const commandCenterStateDefault = { open: false, query: "" };

export const commandCenterState = $state(commandCenterStateDefault);

export function parseProfileId(query: string): number | null {
	const trimmed = query.trim().replace(/^#/, "");
	if (trimmed.length === 0) return null;
	return (
		z.coerce.number().int().nonnegative().safeParse(trimmed).data ?? null
	);
}

export function commandCenterClose() {
	commandCenterState.open = false;
	void tick().then(() => {
		setTimeout(() => {
			if (!commandCenterState.open) {
				commandCenterState.query = "";
			}
		}, 200);
	});
}
