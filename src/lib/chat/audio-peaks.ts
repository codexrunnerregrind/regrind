/**
 * Waveforms for voice notes.
 *
 * Nothing in the API carries peak data, so the bars are measured from the clip
 * itself: the bytes come back through Rust (the webview may not fetch the CDN
 * directly) and are decoded once per message, then kept for as long as the app
 * runs. A note whose bars cannot be worked out draws as a plain line rather
 * than as invented peaks.
 */
import { invoke } from "@tauri-apps/api/core";
import z from "zod";

import { demoEnabled } from "$lib/demo";
import { fromBase64 } from "$lib/util/base64";
import { unproxyMediaUrl } from "$lib/util/media";

export const BAR_COUNT = 32;

// A bar this tall reads as a quiet moment rather than as a gap in the drawing.
const FLOOR = 0.08;

// Voice notes stop at five minutes, which is a fraction of this; anything
// bigger is not something to hold decoded in memory just to draw with.
const MAX_BYTES = 4 * 1024 * 1024;

// Speech carries nothing above a few kHz, and decoding at this rate keeps a
// long note down to a few hundred kilobytes of samples.
const DECODE_RATE = 8000;

/**
 * Reduces samples to one height per bar, each the loudest point in its slice,
 * scaled so the loudest bar in the clip is full height. Exported for its own
 * sake: it is the part worth testing without an audio stack.
 */
export function peaksFromSamples(
	samples: Float32Array,
	bars = BAR_COUNT,
): number[] {
	if (bars <= 0) return [];
	if (samples.length === 0) return Array.from({ length: bars }, () => FLOOR);

	const heights = Array.from({ length: bars }, (_, bar) => {
		const from = Math.floor((bar * samples.length) / bars);
		const to = Math.max(
			from + 1,
			Math.floor(((bar + 1) * samples.length) / bars),
		);
		let loudest = 0;
		for (let i = from; i < to; i++) {
			const level = Math.abs(samples[i] ?? 0);
			if (level > loudest) loudest = level;
		}
		return loudest;
	});

	// Normalising against the clip's own peak matters more than absolute levels:
	// a quiet recording should still fill the row rather than draw as a line.
	const loudest = Math.max(...heights);
	if (loudest <= 0) return heights.map(() => FLOOR);
	return heights.map((height) => Math.max(FLOOR, height / loudest));
}

/**
 * The bars for a clip already in hand — a recording waiting to be sent, say.
 * Null when the clip cannot be read.
 */
export async function measurePeaks(
	bytes: Uint8Array,
): Promise<number[] | null> {
	if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null;
	if (typeof OfflineAudioContext === "undefined") return null;
	// A one-frame context: it is never rendered, it only decides the rate the
	// clip is decoded at.
	const context = new OfflineAudioContext(1, 1, DECODE_RATE);
	try {
		// decodeAudioData detaches the buffer it is handed, so it gets a copy —
		// the caller's bytes may be the recording still waiting to be sent.
		const decoded = await context.decodeAudioData(bytes.slice().buffer);
		return peaksFromSamples(decoded.getChannelData(0));
	} catch (error) {
		console.error("Failed to read the shape of a voice note", error);
		return null;
	}
}

const downloadedMediaSchema = z.object({ data: z.string() });

/** The clip's bytes, taken the way the rest of the app takes media it must read. */
async function fetchVoiceBytes(url: string): Promise<Uint8Array> {
	if (demoEnabled) {
		const response = await fetch(url);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return new Uint8Array(await response.arrayBuffer());
	}
	const { data } = downloadedMediaSchema.parse(
		await invoke("download_media", { url: unproxyMediaUrl(url) }),
	);
	return fromBase64(data);
}

const measured = new Map<string, number[]>();
const inFlight = new Map<string, Promise<number[] | null>>();
// Failures are remembered against the url that failed, not the clip: the most
// likely reason for one is a signature that has run out, and the refreshed url
// the player fetches deserves another go.
const failed = new Set<string>();
// One clip at a time: a conversation can hold a screenful of voice notes, and
// fetching them all at once is a burst of downloads for a row of bars nobody is
// waiting on.
let queue: Promise<unknown> = Promise.resolve();

/**
 * The bars for one remote clip, fetched and decoded on first ask and remembered
 * against `key` — its media id, which outlives the signed url it arrives under.
 * Resolves to null when the clip cannot be read, which is the caller's cue to
 * draw a plain line instead.
 */
export function peaksFor({
	key,
	url,
}: {
	key: string;
	url: string;
}): Promise<number[] | null> {
	const known = measured.get(key);
	if (known !== undefined) return Promise.resolve(known);
	if (failed.has(url)) return Promise.resolve(null);
	const pending = inFlight.get(key);
	if (pending !== undefined) return pending;

	const work = queue.then(async () => {
		try {
			return await measurePeaks(await fetchVoiceBytes(url));
		} catch (error) {
			console.error("Failed to fetch a voice note to draw it", error);
			return null;
		} finally {
			inFlight.delete(key);
		}
	});
	queue = work;
	inFlight.set(key, work);
	void work.then((peaks) => {
		if (peaks === null) failed.add(url);
		else measured.set(key, peaks);
	});
	return work;
}
