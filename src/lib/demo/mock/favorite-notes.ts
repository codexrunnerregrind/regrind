import { DEMO_ID_START, DEMO_PROFILE_COUNT } from "../config";
import { distanceForId, profileSeed } from "./profiles";

type Note = { notes: string; phoneNumber: string };

const SEEDED: Note[] = [
	{ notes: "Met at the bar on Rua Nova", phoneNumber: "" },
	{ notes: "Gym buddy, works nights", phoneNumber: "912345678" },
	{ notes: "Braga — guide", phoneNumber: "" },
];

// Notes only exist for favorites, so the seeds land on the nearest favorited
// profiles — the favorites grid is ordered by distance, which puts them on its
// first page. Mutable so notes written from a profile during a demo session are
// what the grid and its search read back.
const notes = new Map<number, Note>(
	Array.from({ length: DEMO_PROFILE_COUNT }, (_, i) => DEMO_ID_START + i)
		.filter((id) => profileSeed(id).favorite)
		.sort((a, b) => distanceForId(a) - distanceForId(b) || a - b)
		.slice(0, SEEDED.length)
		.map((id, index): [number, Note] => [id, SEEDED[index]]),
);

export function demoFavoriteNote(profileId: number): Note | null {
	return notes.get(profileId) ?? null;
}

// A note write answers with 204 whether or not it stored anything, so the app
// reads it back to be sure. This profile drops writes, exercising that path:
// the editor keeps the text and says so rather than reporting a save.
export const DEMO_NOTE_WRITE_DROPPED_ID = 100013;

export function demoSetFavoriteNote(profileId: number, note: Note): void {
	if (profileId === DEMO_NOTE_WRITE_DROPPED_ID) return;
	notes.set(profileId, note);
}

export function demoDeleteFavoriteNote(profileId: number): void {
	notes.delete(profileId);
}
