import sharp from "sharp";

const AVIF = { quality: 70, effort: 6, chromaSubsampling: "4:4:4" } as const;
const WEBP = { quality: 85, effort: 6, smartSubsample: true } as const;

export async function writeEncodings({
	image,
	basePath,
}: {
	image: Buffer;
	basePath: string;
}): Promise<void> {
	for (const [format, encoded] of Object.entries({
		avif: sharp(image).avif(AVIF),
		webp: sharp(image).webp(WEBP),
	})) {
		const path = `${basePath}.${format}`;
		const { size, width, height } = await encoded.toFile(path);
		console.log(
			`${path} ${width}x${height} ${Math.round(size / 1024)} KiB`,
		);
	}
}
