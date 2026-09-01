/** The rates a voice note plays at, cycled by one button. */
export const PLAYBACK_SPEEDS = [1, 1.5, 2] as const;

export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

export function nextSpeed(speed: PlaybackSpeed): PlaybackSpeed {
	const at = PLAYBACK_SPEEDS.indexOf(speed);
	return PLAYBACK_SPEEDS[(at + 1) % PLAYBACK_SPEEDS.length] ?? 1;
}

/** "1×", "1.5×" — as the button shows it. */
export function formatSpeed(speed: PlaybackSpeed): string {
	return `${speed}×`;
}
