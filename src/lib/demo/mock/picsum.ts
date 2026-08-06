/** A deterministic placeholder image, so a seed always renders the same photo. */
export function picsum({
	seed,
	width = 600,
	height = 800,
}: {
	seed: string;
	width?: number;
	height?: number;
}): string {
	return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${width}/${height}`;
}
