<script lang="ts">
	import FlagIcon from "phosphor-svelte/lib/FlagIcon";
	import FlaskIcon from "phosphor-svelte/lib/FlaskIcon";

	import { getActiveGeohashSnapshot } from "$lib/app-data/preferences.svelte";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import SettingsGroup from "$lib/components/settings/SettingsGroup.svelte";
	import { Spinner } from "$lib/components/ui/spinner";
	import { experimentsState } from "./experiments-state.svelte";
	import ExperimentsFilterBar from "./ExperimentsFilterBar.svelte";

	const geohash = $derived(getActiveGeohashSnapshot());

	$effect(() => {
		if (geohash === null) return;
		experimentsState.load(geohash);
	});
</script>

{#if experimentsState.loading}
	<div class="flex justify-center">
		<Spinner class="size-12" />
	</div>
{:else if experimentsState.error}
	<div class="flex flex-1">
		<ApiErrorDisplay
			error={experimentsState.error}
			onRetry={() => geohash && experimentsState.load(geohash)}
			class="m-auto"
		/>
	</div>
{:else}
	<div class="relative">
		<ExperimentsFilterBar />

		{#if experimentsState.assignments.length === 0}
			No experiments found matching your filters
		{:else}
			<SettingsGroup divider="full">
				{#each experimentsState.assignments as assignment (assignment.key)}
					{@const Icon =
						assignment.type === "FEATURE_FLAG"
							? FlagIcon
							: FlaskIcon}
					<div class="flex items-center gap-4 p-2">
						<div>
							<Icon weight="fill" size={16} />
						</div>
						<div class="text-sm">
							<div class="font-semibold break-all">
								{assignment.key}
							</div>
							<div
								class={[
									{
										"text-red-500":
											assignment.value === "off" ||
											assignment.value === "control",
										"text-green-500":
											assignment.value === "on",
									},
								]}
							>
								{assignment.value}
							</div>
						</div>
					</div>
				{/each}
			</SettingsGroup>
		{/if}
	</div>
{/if}
