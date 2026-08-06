<script lang="ts">
	import {
		CheckIcon,
		DesktopIcon,
		MoonIcon,
		PaperPlaneRightIcon,
		SunIcon,
	} from "phosphor-svelte";
	import { onMount } from "svelte";

	import {
		type AccentColor,
		accentColors,
		type BubbleColor,
		bubbleColors,
		bubbleLabel,
		surface,
	} from "$lib/app-data/palette";
	import {
		getAccentColorSnapshot,
		getIncomingBubbleColorSnapshot,
		getOutgoingBubbleColorSnapshot,
		getPreferences,
		getThemeModeSnapshot,
		setPreferences,
		type ThemeMode,
	} from "$lib/app-data/preferences.svelte";
	import SectionFooter from "$lib/components/settings/SectionFooter.svelte";
	import SectionHeader from "$lib/components/settings/SectionHeader.svelte";
	import SettingsGroup from "$lib/components/settings/SettingsGroup.svelte";
	import SettingsSegmented from "$lib/components/settings/SettingsSegmented.svelte";
	import { hapticSelection } from "$lib/platform/haptics";

	let mode = $state<ThemeMode>(getThemeModeSnapshot());
	let accent = $state<AccentColor>(getAccentColorSnapshot());
	let outgoing = $state<BubbleColor>(getOutgoingBubbleColorSnapshot());
	let incoming = $state<BubbleColor>(getIncomingBubbleColorSnapshot());

	onMount(() => {
		void getPreferences()
			.then((preferences) => {
				mode = preferences.themeMode;
				accent = preferences.accentColor;
				outgoing = preferences.outgoingBubbleColor;
				incoming = preferences.incomingBubbleColor;
			})
			.catch((error) => {
				console.error("Failed to load preferences", error);
			});
	});

	function persist(values: Parameters<typeof setPreferences>[0]) {
		setPreferences(values).catch((error) => {
			console.error("Failed to save preferences", error);
		});
	}

	const modes: { value: ThemeMode; label: string; icon: typeof SunIcon }[] = [
		{ value: "light", label: "Light", icon: SunIcon },
		{ value: "dark", label: "Dark", icon: MoonIcon },
		{ value: "system", label: "System", icon: DesktopIcon },
	];

	/**
	 * Three colours share one swatch grid. Showing three separate grids would put
	 * 40-odd circles on the screen; this way the palette is rendered once and the
	 * segmented control chooses which colour it edits, with the preview above
	 * acting as the legend for all three at once.
	 */
	type Target = "app" | "sent" | "received";

	const targets: { value: Target; label: string }[] = [
		{ value: "app", label: "App" },
		{ value: "sent", label: "Sent" },
		{ value: "received", label: "Received" },
	];

	let target = $state<Target>("app");

	// Bubbles can be left untinted; the app accent always has a colour.
	const swatches = $derived<readonly BubbleColor[]>(
		target === "app" ? accentColors : bubbleColors,
	);

	const selected = $derived<BubbleColor>(
		target === "app" ? accent : target === "sent" ? outgoing : incoming,
	);

	const footnotes: Record<Target, string> = {
		app: "Buttons, links, focus rings and other highlights.",
		sent: "The bubbles for messages you send.",
		received: "The bubbles for messages you receive.",
	};

	function select(color: BubbleColor) {
		if (color !== selected) hapticSelection();
		if (target === "app") {
			if (color === "neutral") return;
			accent = color;
			persist({ accentColor: color });
		} else if (target === "sent") {
			outgoing = color;
			persist({ outgoingBubbleColor: color });
		} else {
			incoming = color;
			persist({ incomingBubbleColor: color });
		}
	}
</script>

<!-- Preview first, and it covers all three colours at once: an incoming bubble,
     an outgoing bubble, and the accent on the send button. -->
<div
	class="flex flex-col gap-2.5 rounded-xl border border-border bg-chat-background p-3"
>
	<div
		class="max-w-[80%] self-start rounded-xl rounded-bl-sm bg-message-bubble-in px-3 py-2 text-caption text-message-bubble-foreground"
	>
		How does this look?
	</div>
	<div
		class="max-w-[80%] self-end rounded-xl rounded-br-sm bg-message-bubble-out px-3 py-2 text-caption text-message-bubble-out-foreground"
	>
		Just right.
	</div>
	<div class="mt-1 flex items-center gap-2">
		<div
			class="flex-1 rounded-full bg-card px-3 py-2 text-caption text-muted-foreground"
		>
			Message…
		</div>
		<div
			class="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
		>
			<PaperPlaneRightIcon weight="fill" class="size-4.5" />
		</div>
	</div>
</div>

<SectionHeader>Mode</SectionHeader>
<SettingsGroup divider="none">
	<div class="p-3">
		<SettingsSegmented
			options={modes}
			stacked
			bind:value={
				() => mode,
				(next: ThemeMode) => {
					if (next !== mode) hapticSelection();
					mode = next;
					persist({ themeMode: next });
				}
			}
		/>
	</div>
</SettingsGroup>
<SectionFooter>
	System matches your device's light or dark setting automatically.
</SectionFooter>

<SectionHeader>Colours</SectionHeader>
<SettingsGroup divider="none">
	<div class="flex flex-col gap-3 p-3">
		<SettingsSegmented options={targets} bind:value={target} />
		<!-- Left-aligned wrap: the row count depends on viewport width, so a
		     centred final row drifts out of line with the ones above it. -->
		<div class="flex flex-wrap justify-start gap-3 px-1 pt-1 pb-1">
			{#each swatches as color (color)}
				<button
					type="button"
					aria-label={bubbleLabel(color)}
					aria-pressed={selected === color}
					onclick={() => select(color)}
					class={[
						"flex size-10 items-center justify-center rounded-full transition",
						"ring-2 ring-offset-2 ring-offset-card",
						{
							"border border-border bg-muted text-foreground":
								color === "neutral",
							"ring-foreground/70": selected === color,
							"ring-transparent active:scale-95": selected !== color,
						},
					]}
					style={color === "neutral"
						? undefined
						: `background-color: ${surface(color).value}; color: ${surface(color).contrast}`}
				>
					{#if selected === color}
						<CheckIcon weight="bold" class="size-5" />
					{/if}
				</button>
			{/each}
		</div>
	</div>
</SettingsGroup>
<SectionFooter>
	{bubbleLabel(selected)} — {footnotes[target]}
</SectionFooter>
