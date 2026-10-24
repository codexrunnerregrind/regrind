<script lang="ts">
	import ArrowsDownUpIcon from "phosphor-svelte/lib/ArrowsDownUpIcon";
	import CheckCircleIcon from "phosphor-svelte/lib/CheckCircleIcon";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		getSortMediaByFrequencySnapshot,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";

	const options = [
		{ value: false, label: "Most recent" },
		{ value: true, label: "Most sent" },
	];
	const byFrequency = $derived(getSortMediaByFrequencySnapshot());

	function select(value: boolean) {
		setPreferences({ sortMediaByFrequency: value }).catch((error) =>
			showErrorToast({ label: "Failed to save preferences", error }),
		);
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<!-- Hangs past the handle row so the target is a full 44px without
			     making the row any taller. -->
			<button
				{...props}
				type="button"
				aria-label="Sort media"
				class={[
					"absolute -end-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-ink3",
					{ "text-primary": byFrequency },
				]}
			>
				<ArrowsDownUpIcon
					weight={byFrequency ? "bold" : "regular"}
					class="size-5"
				/>
			</button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content class="w-52" align="end">
		<DropdownMenu.Label>Sort media</DropdownMenu.Label>
		{#each options as option (option.label)}
			<DropdownMenu.Item onSelect={() => select(option.value)}>
				{#if option.value === byFrequency}
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
