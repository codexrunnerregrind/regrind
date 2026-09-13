export async function withDeadline<T>({
	work,
	ms,
}: {
	work: () => Promise<T>;
	ms: number;
}): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			work(),
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error(`no answer after ${ms} ms`)),
					ms,
				);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}
