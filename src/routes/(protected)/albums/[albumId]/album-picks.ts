import { toast } from "svelte-sonner";

import { showErrorToast } from "$lib/api/error-toast";
import {
	inspectMediaFile,
	type MediaFileInspection,
	mediaFileKindOf,
} from "$lib/platform/media-file";
import type { PickedMedia } from "$lib/platform/media-picker";

export type Uploadable = {
	media: PickedMedia;
	inspection: MediaFileInspection & { kind: "photo" | "video" };
};

/**
 * What each pick is, and how big it is.
 *
 * The native inspection is the better answer — it reads the file rather than
 * trusting its name, and a clip's dimensions come from it — but it calls a clip
 * it cannot probe "unsupported", and an iPhone recording is not always probable.
 * The picker's own content type covers that: the album endpoint takes a clip
 * without its dimensions and only wants them when they are known. A pick neither
 * source calls media is the genuine "not a photo or a video"; a failed
 * inspection is only worth reporting when the fallback cannot answer either.
 */
export async function inspectPicks(
	picked: PickedMedia[],
): Promise<Uploadable[]> {
	const uploadable: Uploadable[] = [];
	for (const media of picked) {
		let failure: unknown = null;
		const inspection = await inspectMediaFile(media).catch(
			(error: unknown) => {
				failure = error;
				return null;
			},
		);
		if (inspection !== null && inspection.kind !== "unsupported") {
			uploadable.push({
				media,
				inspection: { ...inspection, kind: inspection.kind },
			});
			continue;
		}
		const kind = mediaFileKindOf(mimeTypeOf(media));
		if (kind !== "unsupported") {
			uploadable.push({
				media,
				inspection: { kind, size: inspection?.size ?? 0 },
			});
			continue;
		}
		if (failure === null) {
			toast.error("That file isn't a photo or a video");
		} else {
			console.error(failure);
			showErrorToast({
				label: "Couldn't read that file",
				error: failure,
			});
		}
	}
	return uploadable;
}

function mimeTypeOf(media: PickedMedia): string | null {
	return media.source === "web" ? media.file.type : media.mimeType;
}
