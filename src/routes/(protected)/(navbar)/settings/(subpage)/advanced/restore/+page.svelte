<script lang="ts">
	import FolderOpenIcon from "phosphor-svelte/lib/FolderOpenIcon";
	import GearIcon from "phosphor-svelte/lib/GearIcon";
	import { toast } from "svelte-sonner";
	import { SvelteSet } from "svelte/reactivity";

	import { showErrorToast } from "$lib/api/error-toast";
	import { getSavedLocationsSnapshot } from "$lib/app-data/preferences.svelte";
	import { placeImportStatus } from "$lib/app-data/saved-locations-transfer";
	import {
		type Backup,
		BackupReadError,
		backupSettingsCount,
		parseBackup,
		restoreBackup,
	} from "$lib/backup/backup";
	import SettingsGroup from "$lib/components/settings/SettingsGroup.svelte";
	import SettingsRow from "$lib/components/settings/SettingsRow.svelte";
	import { Button } from "$lib/components/ui/button";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { pickTextFile } from "$lib/platform/data-file";
	import PlacesPart from "./PlacesPart.svelte";

	let backup = $state<Backup | null>(null);
	let restoring = $state(false);
	let barHeight = $state(0);
	let restoreSettings = $state(true);
	const selected = new SvelteSet<number>();

	const settingsCount = $derived(
		backup === null ? 0 : backupSettingsCount(backup),
	);
	const rows = $derived(
		(backup?.places ?? []).map((place, index) => ({
			place,
			index,
			status: placeImportStatus(getSavedLocationsSnapshot(), place),
		})),
	);
	const chosen = $derived(
		rows.filter((row) => row.status !== "saved" && selected.has(row.index)),
	);
	const anything = $derived(
		chosen.length > 0 || (restoreSettings && settingsCount > 0),
	);

	const count = (n: number, one: string, many: string) =>
		n === 1 ? `1 ${one}` : `${n} ${many}`;

	async function pick() {
		if (restoring) return;
		try {
			const text = await pickTextFile();
			if (text === null) return;
			const picked = parseBackup(text);
			if (
				picked.places.length === 0 &&
				backupSettingsCount(picked) === 0
			) {
				toast.info("That file has nothing to restore");
				return;
			}
			backup = picked;
			restoreSettings = true;
			selected.clear();
			for (const row of rows) {
				if (row.status !== "saved") selected.add(row.index);
			}
		} catch (caught) {
			console.error(caught);
			if (caught instanceof BackupReadError) {
				toast.error(caught.message);
			} else {
				showErrorToast({
					label: "Couldn't read that file",
					error: caught,
				});
			}
		}
	}

	async function run() {
		if (restoring || backup === null || !anything) return;
		restoring = true;
		try {
			const result = await restoreBackup(backup, {
				settings: restoreSettings,
				places: chosen.map((row) => row.place),
			});
			const skipped = result.places?.skipped ?? 0;
			if (skipped > 0) {
				toast.warning(`Restored — ${skipped} places over the limit`);
			} else {
				toast.success("Restored");
			}
			backup = null;
			selected.clear();
		} catch (caught) {
			console.error(caught);
			showErrorToast({ label: "Couldn't restore backup", error: caught });
		} finally {
			restoring = false;
		}
	}
</script>

<svelte:head>
	<title>Restore from backup</title>
</svelte:head>

<p class="pt-1 pb-3.5 text-preview/[1.45] text-pretty text-ink3">
	Pick a backup or saved places file. The places you tick are added to the
	ones you already have; settings in the file replace yours.
</p>

{#if backup === null}
	<Button variant="outline" class="w-full" onclick={() => void pick()}>
		<FolderOpenIcon weight="fill" />
		Choose a file
	</Button>
{:else}
	<div
		class="mb-[calc(-4rem-0.5rem-var(--content-pb)-var(--bar-content-gap))]"
		style:padding-bottom="{barHeight}px"
	>
		<SettingsGroup>
			{#if settingsCount > 0}
				<SettingsRow
					as="label"
					title="Settings"
					description={count(settingsCount, "setting", "settings")}
					disabled={restoring}
				>
					{#snippet icon()}
						<GearIcon weight="fill" />
					{/snippet}
					{#snippet trailing()}
						<Checkbox
							bind:checked={restoreSettings}
							disabled={restoring}
							aria-label="Restore settings"
						/>
					{/snippet}
				</SettingsRow>
			{/if}
			{#if rows.length > 0}
				<PlacesPart {rows} {selected} disabled={restoring} />
			{/if}
		</SettingsGroup>
	</div>
	<div
		bind:clientHeight={barHeight}
		class="fixed inset-x-0 bottom-0 z-40 bg-background px-4 pt-4 pb-nav-clear"
	>
		<div
			class="mx-auto flex w-full max-w-120 flex-col gap-2 sm:flex-row-reverse"
		>
			<Button
				class="w-full"
				disabled={restoring || !anything}
				onclick={() => void run()}
			>
				Restore
			</Button>
			<Button
				variant="outline"
				class="w-full"
				disabled={restoring}
				onclick={() => void pick()}
			>
				Choose another file
			</Button>
		</div>
	</div>
{/if}
