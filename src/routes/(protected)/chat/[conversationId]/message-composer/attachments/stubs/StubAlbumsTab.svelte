<script lang="ts">
	// Stands in for the albums tab: same instance contract the sheet reads, with
	// buttons to drive the selection the way tapping an album would.
	let { onSelectionChange }: { onSelectionChange?: (count: number) => void } =
		$props();

	let count = $state(0);
	let expiration = $state("INDEFINITE");

	const OPTIONS = [
		{ value: "ONE_DAY", label: "For 24 hours" },
		{ value: "INDEFINITE", label: "Indefinitely" },
	];

	export function actionLabel(): string {
		return "Send";
	}

	export function expiryControl() {
		if (count === 0) return null;
		return {
			label:
				OPTIONS.find((option) => option.value === expiration)?.label ??
				"Indefinitely",
			selected: expiration,
			options: OPTIONS,
			select: (value: string) => (expiration = value),
		};
	}

	export function sendSelected() {}

	function setCount(next: number) {
		count = next;
		onSelectionChange?.(next);
	}
</script>

<button
	type="button"
	aria-label="select album"
	data-testid="select-album"
	onclick={() => setCount(1)}
></button>
<button
	type="button"
	aria-label="deselect album"
	data-testid="deselect-album"
	onclick={() => setCount(0)}
></button>
