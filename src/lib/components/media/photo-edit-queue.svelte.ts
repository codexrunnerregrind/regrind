import { type PickedMedia, readMediaBytes } from "$lib/platform/media-picker";

export type EditedPhoto = {
	bytes: Uint8Array<ArrayBuffer>;
	contentType: string;
};

type Editing = {
	key: string;
	/** Object URL for the pick, alive only while it is on screen. */
	url: string;
	/** How many more picks are waiting behind this one. */
	remaining: number;
	decide: (edit: Blob | null | undefined) => void;
};

/**
 * The picks waiting to be framed, one at a time.
 *
 * Held by the caller and rendered by {@link PhotoEditorDrawer}, so an upload
 * loop can stay a loop: it walks {@link edit} and gets each photo as the editor
 * was left, only once the editor was confirmed for it.
 */
export class PhotoEditQueue {
	current = $state<Editing | null>(null);

	/**
	 * Yields each pick as it was edited. Backing out of the editor ends the
	 * walk: the pick on screen and everything behind it are dropped.
	 */
	async *edit(picked: PickedMedia[]): AsyncGenerator<EditedPhoto> {
		try {
			for (const [index, media] of picked.entries()) {
				const contentType = media.mimeType ?? "image/jpeg";
				const bytes = await readMediaBytes(media);
				const url = URL.createObjectURL(
					new Blob([bytes], { type: contentType }),
				);
				try {
					const edit = await new Promise<Blob | null | undefined>(
						(resolve) => {
							this.current = {
								key: media.key,
								url,
								remaining: picked.length - index - 1,
								decide: resolve,
							};
						},
					);
					if (edit === undefined) return;
					// Nothing was done to it: the picked bytes are the better
					// upload, having been through one encoder fewer.
					yield edit === null
						? { bytes, contentType }
						: {
								bytes: new Uint8Array(await edit.arrayBuffer()),
								contentType: edit.type,
							};
				} finally {
					URL.revokeObjectURL(url);
				}
			}
		} finally {
			this.current = null;
		}
	}

	/** `null` when the editor was left untouched. */
	confirm(edit: Blob | null) {
		this.current?.decide(edit);
	}

	cancel() {
		this.current?.decide(undefined);
	}
}
