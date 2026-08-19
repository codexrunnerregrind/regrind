<script lang="ts">
	import CaretDownIcon from "phosphor-svelte/lib/CaretDownIcon";
	import CheckCircleIcon from "phosphor-svelte/lib/CheckCircleIcon";
	import FolderOpenIcon from "phosphor-svelte/lib/FolderOpenIcon";
	import ImageIcon from "phosphor-svelte/lib/ImageIcon";
	import NavigationArrowIcon from "phosphor-svelte/lib/NavigationArrowIcon";
	import TimerIcon from "phosphor-svelte/lib/TimerIcon";

	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Drawer from "$lib/components/ui/drawer";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import * as Tabs from "$lib/components/ui/tabs";
	import { Toggle } from "$lib/components/ui/toggle";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import ComposerAlbumsTab from "./ComposerAlbumsTab.svelte";
	import ComposerLocationTab from "./ComposerLocationTab.svelte";
	import ComposerMediaTab from "./ComposerMediaTab.svelte";

	const FULLSIZE_TABS: Tab[] = ["media", "albums"];

	let { open = $bindable() }: { open: boolean } = $props();

	type Tab = "media" | "albums" | "location";
	// `actionLabel` lets a tab rename the confirm button — the albums tab takes a
	// share back as readily as it grants one, and "Send" is wrong for that.
	// `expiryControl` lets a tab put a setting of its own on the line above the
	// confirm button, where it stays put as the tab's own content scrolls.
	type ExpiryControl = {
		label: string;
		selected: string;
		options: { value: string; label: string }[];
		select: (value: never) => void;
	};
	type SelectionTab = {
		sendSelected: () => void;
		actionLabel?: () => string;
		expiryControl?: () => ExpiryControl | null;
	};

	let selectedTab = $state<Tab>("media");

	const isFullsizeTab = $derived(FULLSIZE_TABS.includes(selectedTab));

	let sheet = $state<HTMLDivElement | null>(null);
	let peek = $state<HTMLDivElement | null>(null);
	let tabs = $state<Partial<Record<Tab, SelectionTab | null>>>({});
	let counts = $state<Partial<Record<Tab, number>>>({});
	let expiring = $state(false);

	const selectedCount = $derived(counts[selectedTab] ?? 0);

	// Every tab confirms from the same row, so its button sits at one height
	// whichever tab is showing.
	const showActionRow = $derived(selectedCount > 0);

	// Closed with the selection: the dropdown's content is portalled out of the
	// row, so nothing else would take it off screen with the button that opened
	// it.
	let expiryOpen = $state(false);

	const expiry = $derived(
		selectedCount === 0
			? null
			: (tabs[selectedTab]?.expiryControl?.() ?? null),
	);

	$effect(() => {
		if (expiry === null) expiryOpen = false;
	});

	function sendSelected() {
		tabs[selectedTab]?.sendSelected();
	}

	const settleQuietMs = 140;
	let settleTimer: ReturnType<typeof setTimeout> | null = null;

	function settleToNearestSize() {
		const el = sheet;
		const range = peek?.offsetHeight ?? 0;
		if (!el || el.scrollTop <= 0 || el.scrollTop >= range) return;
		el.scrollTo({
			top: el.scrollTop < range / 2 ? 0 : range,
			behavior: "smooth",
		});
	}

	function scheduleSettle() {
		if (settleTimer !== null) clearTimeout(settleTimer);
		settleTimer = setTimeout(() => {
			settleTimer = null;
			settleToNearestSize();
		}, settleQuietMs);
	}

	$effect(() => {
		if (open) return;
		if (settleTimer !== null) clearTimeout(settleTimer);
		settleTimer = null;
		counts = {};
		expiring = false;
	});

	dismissOnBackGesture({
		active: () => open,
		dismiss: () => {
			open = false;
		},
	});
</script>

<Drawer.Root bind:open>
	<Drawer.Content
		class={[
			"mx-auto max-w-200 border-none bg-transparent p-0 shadow-none before:hidden",
			{ "h-full": isFullsizeTab, "h-fit": !isFullsizeTab },
		]}
		handle={null}
		onclick={(e) => {
			if (
				e.target instanceof HTMLDivElement &&
				e.target.dataset.slot === "sheet-scroller"
			) {
				open = false;
			}
		}}
		preventOverflowTextSelection={false}
	>
		<Tabs.Root
			bind:value={selectedTab}
			class={["min-h-0 gap-0", { "h-full": isFullsizeTab }]}
		>
			<div
				bind:this={sheet}
				data-slot="sheet-scroller"
				onscroll={scheduleSettle}
				class={[
					"overflow-x-hidden  overscroll-contain select-none",
					{
						"h-full overflow-y-auto": isFullsizeTab,
						"h-fit": !isFullsizeTab,
					},
				]}
			>
				{#if isFullsizeTab}
					<div
						bind:this={peek}
						data-slot="sheet-peek"
						class="pointer-events-none h-2/5"
					></div>
				{/if}
				<div
					data-slot="sheet-panel"
					class={[
						" rounded-t-4xl border border-border bg-popover px-4 pb-20 shadow-xl",
						{ "min-h-full": isFullsizeTab },
					]}
				>
					<div
						data-slot="drawer-handle"
						class="mx-auto my-3 h-1.5 w-25 rounded-full bg-muted"
					></div>
					<Tabs.Content value="media">
						<ComposerMediaTab
							bind:this={tabs.media}
							{expiring}
							onSelectionChange={(count) =>
								(counts.media = count)}
							onClose={() => (open = false)}
						/>
					</Tabs.Content>
					<Tabs.Content value="albums">
						<!-- Tabs.Content renders regardless of the active tab, so
						     the tab is told whether it is showing rather than
						     fetching albums every time the sheet opens. -->
						<ComposerAlbumsTab
							bind:this={tabs.albums}
							active={selectedTab === "albums"}
							onSelectionChange={(count) =>
								(counts.albums = count)}
							onClose={() => (open = false)}
						/>
					</Tabs.Content>
					<Tabs.Content value="location">
						<ComposerLocationTab
							bind:this={tabs.location}
							onSelectionChange={(count) =>
								(counts.location = count)}
							onClose={() => (open = false)}
						/>
					</Tabs.Content>
				</div>
			</div>

			<!-- The row stays mounted and animates by class rather than flying in
			     and out of the DOM: as a leaving branch it stopped updating mid
			     flight, so anything opened from inside it hung on screen until
			     the flight finished. `inert` closes it to input while it is
			     away. -->
			<div
				class={[
					"pointer-events-none absolute inset-x-0 bottom-20 z-1100 flex flex-col items-center gap-3",
					// `visibility` rides along so the row is gone for good once it
					// has flown out — opacity alone leaves the buttons standing
					// in the page, reachable by anything that goes by role.
					"transition-[opacity,transform,visibility] duration-300 ease-out motion-reduce:transition-none",
					{
						"visible translate-y-0 opacity-100": showActionRow,
						"invisible translate-y-28 opacity-0": !showActionRow,
					},
				]}
				inert={!showActionRow}
			>
				<!-- The menu is mounted with its trigger, not around the whole
				     row: a root that comes up before its trigger exists takes no
				     anchor from the trigger that arrives later, and the content
				     then opens unpositioned, parked off screen above the sheet. -->
				{#if expiry}
					<DropdownMenu.Root bind:open={expiryOpen}>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<button
									{...props}
									type="button"
									class="pointer-events-auto flex items-center gap-1.5 text-base font-semibold"
								>
									<CheckCircleIcon
										weight="regular"
										class="size-5 text-primary"
									/>
									{expiry.label}
									<CaretDownIcon
										weight="bold"
										class="size-3.5"
									/>
								</button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content class="w-52" align="center">
							<DropdownMenu.Label
								>Share album for…</DropdownMenu.Label
							>
							{#each expiry.options as option (option.value)}
								<DropdownMenu.Item
									onSelect={() =>
										expiry.select(option.value as never)}
								>
									{#if option.value === expiry.selected}
										<CheckCircleIcon
											weight="fill"
											class="size-5 text-primary"
										/>
									{:else}
										<span class="size-5"></span>
									{/if}
									{option.label}
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/if}
				<div class="flex justify-center gap-2">
					{#if selectedTab === "media"}
						<Toggle
							aria-label="Set photo as expiring after 10 seconds"
							size="lg"
							class={[
								"pointer-events-auto",
								{
									"bg-muted hover:bg-muted/80": !expiring,
									"bg-popover-foreground! text-popover hover:bg-popover-foreground/80! hover:text-popover":
										expiring,
								},
							]}
							variant="default"
							bind:pressed={expiring}
						>
							<TimerIcon
								weight={expiring ? "fill" : "regular"}
								class="size-5"
							/>
							{#if expiring}
								10s
							{:else}
								Off
							{/if}
						</Toggle>
					{/if}
					<Button
						size="lg"
						class="pointer-events-auto shadow-lg"
						onclick={sendSelected}
					>
						{expiring && selectedTab === "media"
							? "Send Expiring"
							: (tabs[selectedTab]?.actionLabel?.() ?? "Send")}
						{#if selectedTab === "media"}
							<Badge
								variant="secondary"
								class="bg-primary-foreground/10 text-primary-foreground"
							>
								{selectedCount}
							</Badge>
						{/if}
					</Button>
				</div>
			</div>

			<Drawer.Footer
				class="absolute inset-x-0 bottom-0 items-center rounded-b-4xl pt-1 pb-2 select-none"
			>
				<Tabs.List>
					{@render tab("media")}
					{@render tab("albums")}
					{@render tab("location")}
				</Tabs.List>
			</Drawer.Footer>
		</Tabs.Root>
	</Drawer.Content>
</Drawer.Root>

{#snippet tab(tab: Tab)}
	<Tabs.Trigger value={tab} class="h-auto flex-col gap-0.5 px-4 py-1.5">
		{#if tab === "media"}
			<ImageIcon weight="fill" class="size-5" />
			Media
		{:else if tab === "albums"}
			<FolderOpenIcon weight="fill" class="size-5" />
			Albums
		{:else if tab === "location"}
			<NavigationArrowIcon weight="fill" class="size-5" />
			Location
		{/if}
	</Tabs.Trigger>
{/snippet}
