<script lang="ts">
	import CheckIcon from "phosphor-svelte/lib/CheckIcon";
	import { onMount } from "svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import { Button } from "$lib/components/ui/button";
	import { getAppIcon, setAppIcon } from "$lib/platform/app-icon";
	import {
		type AppIconColor,
		appIconColors,
		type AppIconGlyph,
		appIconId,
		appIcons,
		parseAppIconId,
	} from "$lib/platform/app-icon-catalog";
	import { hapticSelection } from "$lib/platform/haptics";

	const previews = import.meta.glob<string>(
		"/src/lib/assets/app-icons/*.svg",
		{ eager: true, query: "?url", import: "default" },
	);
	const preview = (file: string) =>
		previews[`/src/lib/assets/app-icons/${file}.svg`]!;

	// What the OS has now, and what is picked here but not applied yet: iOS
	// confirms every change with an alert, so browsing must not apply.
	let current = $state<string | null | undefined>(undefined);
	let glyph = $state<AppIconGlyph | null>(null);
	// Each glyph keeps its own color, starting from its default.
	let colors = $state(
		Object.fromEntries(
			appIcons.map(({ id, color }) => [id, color]),
		) as Record<AppIconGlyph, AppIconColor>,
	);
	let applying = $state(false);

	const colorOf = (id: AppIconGlyph) => colors[id];

	const selected = $derived(glyph && appIconId(glyph, colorOf(glyph)));

	const options = $derived([
		{ id: null, label: "ReGrind", src: preview("default") },
		...appIcons.map(({ id, label }) => ({
			id,
			label,
			src: preview(appIconId(id, colorOf(id))),
		})),
	]);

	const selectedLabel = $derived(
		options.find((option) => option.id === glyph)!.label,
	);

	onMount(() => {
		getAppIcon()
			.then((icon) => {
				current = icon;
				const parsed = icon && parseAppIconId(icon);
				if (parsed) {
					glyph = parsed.glyph;
					colors[parsed.glyph] = parsed.color;
				}
			})
			.catch((error: unknown) => {
				current = null;
				console.error("Failed to read the app icon", error);
			});
	});

	function apply() {
		applying = true;
		const icon = selected;
		setAppIcon(icon)
			.then(() => {
				current = icon;
			})
			.catch((error: unknown) => {
				showErrorToast({
					label: "Couldn't change the app icon",
					error,
				});
			})
			.finally(() => {
				applying = false;
			});
	}
</script>

<div class="flex flex-col gap-4 p-4">
	<div class="grid grid-cols-4 gap-x-3 gap-y-4">
		{#each options as option (option.id)}
			<button
				type="button"
				aria-pressed={glyph === option.id}
				disabled={current === undefined}
				onclick={() => {
					if (glyph !== option.id) hapticSelection();
					glyph = option.id;
				}}
				class="flex min-w-0 flex-col items-center gap-1.5"
			>
				<span
					class={[
						"relative block aspect-square w-full max-w-16 rounded-[22.5%] ring-2 ring-offset-2 ring-offset-card transition",
						{
							"ring-foreground/70": glyph === option.id,
							"ring-transparent active:scale-95":
								glyph !== option.id,
						},
					]}
				>
					<img
						src={option.src}
						alt=""
						class="size-full rounded-[22.5%] shadow-sm"
						draggable="false"
					/>
					{#if option.id === null ? current === null : current === appIconId(option.id, colorOf(option.id))}
						<span
							class="absolute -right-1.5 -bottom-1.5 grid size-5 place-items-center rounded-full border-2 border-card bg-primary text-primary-foreground"
						>
							<CheckIcon weight="bold" class="size-3" />
						</span>
					{/if}
				</span>
				<span
					class={[
						"max-w-full truncate text-caption",
						{
							"text-foreground": glyph === option.id,
							"text-muted-foreground": glyph !== option.id,
						},
					]}
				>
					{option.label}
				</span>
			</button>
		{/each}
	</div>
	<div
		class={[
			"flex flex-wrap justify-center gap-3 transition-opacity",
			{ "pointer-events-none opacity-40": glyph === null },
		]}
	>
		{#each appIconColors as option (option.id)}
			{@const active = glyph !== null && colorOf(glyph) === option.id}
			<button
				type="button"
				aria-label={option.label}
				aria-pressed={active}
				disabled={glyph === null}
				onclick={() => {
					if (!glyph) return;
					if (!active) hapticSelection();
					colors[glyph] = option.id;
				}}
				class={[
					"flex size-9 items-center justify-center rounded-full text-white ring-2 ring-offset-2 ring-offset-card transition",
					{
						"ring-foreground/70": active,
						"ring-transparent active:scale-95": !active,
					},
				]}
				style={`background-image: linear-gradient(${option.top}, ${option.bottom})`}
			>
				{#if active}
					<CheckIcon weight="bold" class="size-4" />
				{/if}
			</button>
		{/each}
	</div>
	<Button
		disabled={current === undefined || selected === current || applying}
		onclick={apply}
	>
		{selected === current ? "In use" : `Use ${selectedLabel}`}
	</Button>
</div>
