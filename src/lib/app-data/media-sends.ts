import {
	getPreferences,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import { forgetSends, recordSends } from "$lib/model/media-sends";

export async function rememberMediaSends(
	ids: readonly number[],
	now = Date.now(),
): Promise<void> {
	if (ids.length === 0) return;
	const { mediaSends } = await getPreferences();
	await setPreferences({ mediaSends: recordSends(mediaSends, ids, now) });
}

export async function forgetMediaSends(ids: readonly number[]): Promise<void> {
	const { mediaSends } = await getPreferences();
	if (!ids.some((id) => id in mediaSends)) return;
	await setPreferences({ mediaSends: forgetSends(mediaSends, ids) });
}
