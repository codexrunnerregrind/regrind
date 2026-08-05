import { DEMO_ID_START } from "../config";

// Mutable so the settings list agrees with blocks made from the profile or chat
// menus during a demo session.
const blocked = new Set<number>([DEMO_ID_START + 3, DEMO_ID_START + 11]);

// `blockedTime` is `0` here because that is what the real endpoint returns —
// nothing in the app reads it.
export function demoBlockedUsers() {
	return [...blocked].map((profileId) => ({ profileId, blockedTime: 0 }));
}

export function demoSetBlocked(profileId: number, isBlocked: boolean): void {
	if (isBlocked) blocked.add(profileId);
	else blocked.delete(profileId);
}
