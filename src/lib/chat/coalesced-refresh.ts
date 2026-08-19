/**
 * A refetch several signals can ask for and only one of which happens.
 *
 * Server signals routinely arrive in bursts — a delete alongside a cache bomb,
 * an update per conversation — and each one alone means the same thing: refetch.
 */
export class CoalescedRefresh {
	#timer: ReturnType<typeof setTimeout> | null = null;
	readonly #run: () => void;
	readonly #delayMs: number;

	constructor({ run, delayMs }: { run: () => void; delayMs: number }) {
		this.#run = run;
		this.#delayMs = delayMs;
	}

	request(): void {
		if (this.#timer !== null) return;
		this.#timer = setTimeout(() => {
			this.#timer = null;
			this.#run();
		}, this.#delayMs);
	}

	cancel(): void {
		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#timer = null;
	}
}
