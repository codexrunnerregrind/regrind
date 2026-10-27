<script lang="ts">
	import {
		getMatchesCardStyleSnapshot,
		type MatchesCardStyle,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import { hapticSelection } from "$lib/platform/haptics";
	import { matchesState } from "./matches-state.svelte";
	import MatchesInfoSheet from "./MatchesInfoSheet.svelte";

	let infoOpen = $state(false);

	const style = $derived(getMatchesCardStyleSnapshot());

	// The API gives no time for the next refresh, only that it is daily.
	const summary = $derived(
		matchesState.loaded
			? `${matchesState.serverTotal} ${matchesState.serverTotal === 1 ? "pick" : "picks"} · refreshed daily`
			: "Refreshed daily",
	);

	function choose(next: MatchesCardStyle) {
		if (next === style) return;
		hapticSelection();
		void setPreferences({ matchesCardStyle: next });
	}
</script>

<div class="flex items-center justify-between gap-3 py-3">
	<span class="min-w-0 flex-1 truncate text-xs text-ink3">{summary}</span>
	<div
		role="radiogroup"
		aria-label="Card size"
		class="flex shrink-0 rounded-md bg-secondary p-0.5"
	>
		<button
			type="button"
			role="radio"
			aria-checked={style === "full"}
			aria-label="Full cards"
			class={[
				"flex h-6 w-7 items-center justify-center rounded-sm",
				{
					"bg-card text-foreground": style === "full",
					"text-ink3": style !== "full",
				},
			]}
			onclick={() => choose("full")}
		>
			<svg
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				stroke-width="1.4"
				class="size-3.5"
				aria-hidden="true"
			>
				<rect x="1.8" y="1.8" width="5.4" height="12.4" rx="1.4" />
				<rect x="8.8" y="1.8" width="5.4" height="12.4" rx="1.4" />
			</svg>
		</button>
		<button
			type="button"
			role="radio"
			aria-checked={style === "compact"}
			aria-label="Compact"
			class={[
				"flex h-6 w-7 items-center justify-center rounded-sm",
				{
					"bg-card text-foreground": style === "compact",
					"text-ink3": style !== "compact",
				},
			]}
			onclick={() => choose("compact")}
		>
			<svg
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				stroke-width="1.4"
				class="size-3.5"
				aria-hidden="true"
			>
				{#each [1.6, 6.2, 10.8] as y (y)}
					{#each [1.6, 6.2, 10.8] as x (x)}
						<rect {x} {y} width="3.6" height="3.6" rx=".9" />
					{/each}
				{/each}
			</svg>
		</button>
	</div>
	<button
		type="button"
		aria-label="How Best matches works"
		class="-m-1 flex size-7 shrink-0 items-center justify-center text-muted-foreground"
		onclick={() => (infoOpen = true)}
	>
		<svg
			viewBox="0 0 20 20"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			class="size-4.25"
			aria-hidden="true"
		>
			<circle cx="10" cy="10" r="7.6" />
			<path d="M10 9v4.6" />
			<circle cx="10" cy="6.4" r=".5" fill="currentColor" />
		</svg>
	</button>
</div>

<MatchesInfoSheet bind:open={infoOpen} />
