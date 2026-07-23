<script lang="ts">
	import { CheckIcon, DesktopIcon, MoonIcon, SunIcon } from "phosphor-svelte";
	import { onMount } from "svelte";

	import {
		type AccentColor,
		accentColors,
		getAccentColorSnapshot,
		getPreferences,
		getThemeModeSnapshot,
		setPreferences,
		type ThemeMode,
	} from "$lib/app-data/preferences.svelte";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import { hapticSelection } from "$lib/platform/haptics";

	let value = $state<ThemeMode>(getThemeModeSnapshot());
	let accent = $state<AccentColor>(getAccentColorSnapshot());

	onMount(() => {
		void getPreferences()
			.then((preferences) => {
				value = preferences.themeMode;
				accent = preferences.accentColor;
			})
			.catch((error) => {
				console.error("Failed to load preferences", error);
			});
	});

	const modes: { value: ThemeMode; label: string; icon: typeof SunIcon }[] = [
		{ value: "light", label: "Light", icon: SunIcon },
		{ value: "dark", label: "Dark", icon: MoonIcon },
		{ value: "system", label: "System", icon: DesktopIcon },
	];

	// oklch swatch previews, matching the [data-accent="…"] blocks in layout.css.
	const accentSwatches: Record<AccentColor, string> = {
		green: "oklch(0.62 0.13 168)",
		teal: "oklch(0.6 0.1 195)",
		blue: "oklch(0.58 0.16 250)",
		indigo: "oklch(0.52 0.17 275)",
		purple: "oklch(0.55 0.18 305)",
		pink: "oklch(0.6 0.2 350)",
		red: "oklch(0.58 0.21 25)",
		orange: "oklch(0.63 0.17 50)",
		yellow: "oklch(0.85 0.16 92)",
		brown: "oklch(0.5 0.08 50)",
		slate: "oklch(0.52 0.03 250)",
	};

	function selectAccent(next: AccentColor) {
		if (next !== accent) hapticSelection();
		accent = next;
		setPreferences({ accentColor: next }).catch((error) => {
			console.error("Failed to save preferences", error);
		});
	}
</script>

<h2>Mode</h2>
<ToggleGroup.Root
	type="single"
	variant="outline"
	class="grid w-full grid-cols-3 gap-3"
	bind:value={
		() => value,
		(next: string) => {
			const themeMode = (next || "system") as ThemeMode;
			if (themeMode !== value) hapticSelection();
			value = themeMode;
			setPreferences({ themeMode }).catch((error) => {
				console.error("Failed to save preferences", error);
			});
		}
	}
>
	{#each modes as mode (mode.value)}
		<ToggleGroup.Item
			value={mode.value}
			class="flex h-auto flex-col items-center justify-center gap-2 rounded-2xl py-5 data-[state=on]:border-primary data-[state=on]:text-primary"
		>
			<mode.icon weight="fill" class="size-7" />
			<span class="text-sm font-medium">{mode.label}</span>
		</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
<p class="px-1 text-sm text-muted-foreground">
	System matches your device's light or dark setting automatically.
</p>

<h2>Accent colour</h2>
<div class="grid grid-cols-6 gap-3 px-1 py-1">
	{#each accentColors as color (color)}
		<button
			type="button"
			aria-label={color}
			aria-pressed={accent === color}
			onclick={() => selectAccent(color)}
			class={[
				"flex aspect-square items-center justify-center rounded-full transition",
				"ring-2 ring-offset-2 ring-offset-background",
				color === "yellow" ? "text-black/80" : "text-white",
				accent === color
					? "ring-foreground/70"
					: "ring-transparent active:scale-95",
			]}
			style="background-color: {accentSwatches[color]}"
		>
			{#if accent === color}
				<CheckIcon weight="bold" class="size-5" />
			{/if}
		</button>
	{/each}
</div>

<style lang="postcss">
	@reference "$layout";

	h2 {
		@apply mt-2 truncate ps-4 text-xl font-semibold tracking-tight;
	}
</style>
