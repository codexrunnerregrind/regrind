<script lang="ts">
	import AppWindowIcon from "phosphor-svelte/lib/AppWindowIcon";
	import CheckIcon from "phosphor-svelte/lib/CheckIcon";
	import DesktopIcon from "phosphor-svelte/lib/DesktopIcon";
	import GridFourIcon from "phosphor-svelte/lib/GridFourIcon";
	import ImageIcon from "phosphor-svelte/lib/ImageIcon";
	import MoonIcon from "phosphor-svelte/lib/MoonIcon";
	import PaperPlaneRightIcon from "phosphor-svelte/lib/PaperPlaneRightIcon";
	import SunIcon from "phosphor-svelte/lib/SunIcon";
	import UsersThreeIcon from "phosphor-svelte/lib/UsersThreeIcon";
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
		getAlbumGridColumnsSnapshot,
		getChatWallpaperSnapshot,
		getIncomingBubbleColorSnapshot,
		getNavBarGlassSnapshot,
		getOutgoingBubbleColorSnapshot,
		getPreferences,
		getProfileGridColumnsSnapshot,
		getThemeModeSnapshot,
		preferencesLoaded,
		setPreferences,
		type ThemeMode,
	} from "$lib/app-data/preferences.svelte";
	import SectionFooter from "$lib/components/settings/SectionFooter.svelte";
	import SectionHeader from "$lib/components/settings/SectionHeader.svelte";
	import SettingsGroup from "$lib/components/settings/SettingsGroup.svelte";
	import SettingsSegmented from "$lib/components/settings/SettingsSegmented.svelte";
	import SettingsSwitchRow from "$lib/components/settings/SettingsSwitchRow.svelte";
	import { hapticSelection } from "$lib/platform/haptics";
	import BackdropBlurSetting from "./BackdropBlurSetting.svelte";
	import GridColumnsSetting from "./GridColumnsSetting.svelte";

	let mode = $state<ThemeMode>(getThemeModeSnapshot());
	let accent = $state<AccentColor>(getAccentColorSnapshot());
	let outgoing = $state<BubbleColor>(getOutgoingBubbleColorSnapshot());
	let incoming = $state<BubbleColor>(getIncomingBubbleColorSnapshot());
	let navGlass = $state(getNavBarGlassSnapshot());
	let wallpaper = $state(getChatWallpaperSnapshot());

	onMount(() => {
		void getPreferences()
			.then((preferences) => {
				mode = preferences.themeMode;
				accent = preferences.accentColor;
				outgoing = preferences.outgoingBubbleColor;
				incoming = preferences.incomingBubbleColor;
				navGlass = preferences.navBarGlass;
				wallpaper = preferences.chatWallpaper;
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
	 * Three colors share one swatch grid. Showing three separate grids would put
	 * 40-odd circles on the screen; this way the palette is rendered once and the
	 * segmented control chooses which color it edits, with the preview above
	 * acting as the legend for all three at once.
	 */
	type Target = "app" | "sent" | "received";

	const targets: { value: Target; label: string }[] = [
		{ value: "app", label: "App" },
		{ value: "sent", label: "Sent" },
		{ value: "received", label: "Received" },
	];

	let target = $state<Target>("app");

	// Bubbles can be left untinted; the app accent always has a color.
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

<!-- Preview first, and it covers all three colors at once: an incoming bubble,
     an outgoing bubble, and the accent on the send button. -->
<div
	class={[
		"relative flex flex-col gap-2.5 overflow-hidden rounded-xl border border-border bg-chat-background p-3",
		{ "chat-wallpaper": wallpaper },
	]}
>
	<div
		class="relative max-w-[80%] self-start rounded-xl rounded-bl-sm bg-message-bubble-in px-3 py-2 text-caption text-message-bubble-foreground"
	>
		How does this look?
	</div>
	<div
		class="relative max-w-[80%] self-end rounded-xl rounded-br-sm bg-message-bubble-out px-3 py-2 text-caption text-message-bubble-out-foreground"
	>
		Just right.
	</div>
	<div class="relative mt-1 flex items-center gap-2">
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

<SectionHeader>Colors</SectionHeader>
<SettingsGroup divider="none">
	<div class="flex flex-col gap-3 p-3">
		<SettingsSegmented options={targets} bind:value={target} />
		<!-- Left-aligned wrap: the row count depends on viewport width, so a
		     centered final row drifts out of line with the ones above it. -->
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
							"ring-transparent active:scale-95":
								selected !== color,
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

<SectionHeader>Chat</SectionHeader>
<SettingsGroup divider="none">
	<SettingsSwitchRow
		title="Wallpaper"
		description="A doodle pattern behind your conversations."
		disabled={!preferencesLoaded()}
		bind:checked={
			() => wallpaper,
			(next: boolean) => {
				hapticSelection();
				wallpaper = next;
				persist({ chatWallpaper: next });
			}
		}
	>
		{#snippet icon()}
			<ImageIcon weight="fill" />
		{/snippet}
	</SettingsSwitchRow>
</SettingsGroup>
<SectionFooter>
	Off leaves the plain chat background. The preview above shows both.
</SectionFooter>

<SectionHeader>Navigation bar</SectionHeader>
<SettingsGroup divider="none">
	<SettingsSwitchRow
		title="Floating glass"
		description="A rounded, see-through bar that floats above the screen."
		disabled={!preferencesLoaded()}
		bind:checked={
			() => navGlass,
			(next: boolean) => {
				hapticSelection();
				navGlass = next;
				persist({ navBarGlass: next });
			}
		}
	>
		{#snippet icon()}
			<AppWindowIcon weight="fill" />
		{/snippet}
	</SettingsSwitchRow>
</SettingsGroup>
<SectionFooter>
	The tabs sit in a rounded bar that lifts off the bottom of the screen,
	instead of one that spans it.
</SectionFooter>

<SectionHeader>Background blur</SectionHeader>
<SettingsGroup divider="none">
	<BackdropBlurSetting />
</SettingsGroup>
<SectionFooter>
	How much the bars, menus and sheets blur what is behind them. Less blur
	costs less to draw, which helps on older devices.
</SectionFooter>

<SectionHeader>Grid</SectionHeader>
<SettingsGroup divider="full">
	<GridColumnsSetting
		title="Profiles"
		description="The browse grid and profile views."
		icon={UsersThreeIcon}
		value={getProfileGridColumnsSnapshot()}
		save={(profileGridColumns) => ({ profileGridColumns })}
	/>
	<GridColumnsSetting
		title="Albums"
		description="Album covers and the photos inside them."
		icon={GridFourIcon}
		value={getAlbumGridColumnsSnapshot()}
		save={(albumGridColumns) => ({ albumGridColumns })}
	/>
</SettingsGroup>
<SectionFooter>
	How many tiles fit across at phone width. Wider screens step up from
	whichever count you pick.
</SectionFooter>
