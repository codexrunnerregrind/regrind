import {
	describeMediaFailure,
	mediaFailure,
} from "$lib/platform/media-failure";

export type MediaDimensions = { width: number; height: number };

async function imageLoadFailure(url: string): Promise<Error> {
	const failure = describeMediaFailure(await mediaFailure(url));
	return new Error(`Failed to load image (${failure})`);
}

export async function measureImage(url: string): Promise<MediaDimensions> {
	const img = document.createElement("img");
	img.src = url;
	try {
		await new Promise<void>((resolve, reject) => {
			const fail = () => void imageLoadFailure(url).then(reject);
			if (img.complete) {
				if (img.naturalWidth > 0) resolve();
				else fail();
			}
			img.addEventListener("load", () => resolve(), { once: true });
			img.addEventListener("error", fail, { once: true });
		});
		return { width: img.naturalWidth, height: img.naturalHeight };
	} finally {
		img.remove();
	}
}

export async function measureVideo(url: string): Promise<MediaDimensions> {
	const video = document.createElement("video");
	// Only the header is needed to learn the dimensions; without this the browser
	// would start pulling the whole file down just to measure it.
	video.preload = "metadata";
	video.src = url;
	video.load();
	try {
		await new Promise<void>((resolve, reject) => {
			if (video.readyState >= HTMLMediaElement.HAVE_METADATA) resolve();
			video.addEventListener("loadedmetadata", () => resolve(), {
				once: true,
			});
			video.addEventListener(
				"error",
				({ error }) =>
					reject(
						new Error(`Failed to load video: ${url}`, {
							cause: error,
						}),
					),
				{ once: true },
			);
		});
		return { width: video.videoWidth, height: video.videoHeight };
	} finally {
		video.removeAttribute("src");
		video.load();
		video.remove();
	}
}
