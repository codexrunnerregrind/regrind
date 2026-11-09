<script lang="ts">
	import { showErrorToast } from "#lib/api/error-toast.ts";
	import {
		preferencesLoaded,
		preferencesSnapshot,
		setPreferences,
	} from "#lib/app-data/preferences.svelte.ts";
	import { Slider } from "#lib/components/ui/slider/index.ts";
	import { hapticSelection } from "#lib/platform/haptics.ts";

	// 85% to 130% in 5% steps.
	const STEPS = Array.from({ length: 10 }, (_, i) => (85 + i * 5) / 100);

	let pending = $state<number | null>(null);
	const scale = $derived(pending ?? preferencesSnapshot().textScale);
	const position = $derived(Math.round((scale - STEPS[0]!) / 0.05));

	function choose(next: number) {
		const textScale = STEPS[next] ?? 1;
		if (textScale === scale) return;
		hapticSelection();
		pending = textScale;
		setPreferences({ textScale })
			.catch((error: unknown) => {
				showErrorToast({ label: "Failed to save preferences", error });
			})
			.finally(() => {
				pending = null;
			});
	}
</script>

<div class="flex flex-col gap-3 p-4">
	<div class="flex items-center gap-3">
		<span aria-hidden="true" class="text-xs font-medium">A</span>
		<Slider
			type="single"
			class="flex-1"
			min={0}
			max={STEPS.length - 1}
			step={1}
			disabled={!preferencesLoaded()}
			thumbLabels={["Text size"]}
			thumbValueTexts={[`${Math.round(scale * 100)}%`]}
			bind:value={() => position, choose}
		/>
		<span aria-hidden="true" class="text-xl font-medium">A</span>
	</div>
	<span class="text-caption leading-snug text-muted-foreground">
		{Math.round(scale * 100)}%{scale === 1 ? " (default)" : ""}
	</span>
</div>
