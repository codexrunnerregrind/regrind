/**
 * How long a video is, read by the webview rather than by us: the API wants a
 * length with the upload, and decoding a container in Rust to find one would be
 * a video parser we do not need.
 */
export function videoDurationSeconds({
	bytes,
	contentType,
}: {
	bytes: Uint8Array<ArrayBuffer>;
	contentType: string;
}): Promise<number | null> {
	return new Promise((resolve) => {
		const url = URL.createObjectURL(
			new Blob([bytes], { type: contentType }),
		);
		const video = document.createElement("video");
		const done = (seconds: number | null) => {
			URL.revokeObjectURL(url);
			resolve(seconds);
		};
		video.preload = "metadata";
		video.onloadedmetadata = () =>
			done(
				Number.isFinite(video.duration) && video.duration > 0
					? Math.ceil(video.duration)
					: null,
			);
		// A container the webview cannot read is not fatal: the upload carries no
		// length, which is how every video the official app cannot measure goes up.
		video.onerror = () => done(null);
		video.src = url;
	});
}
