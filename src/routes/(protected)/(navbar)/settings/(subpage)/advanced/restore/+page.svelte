<script lang="ts">
	import FolderOpenIcon from "phosphor-svelte/lib/FolderOpenIcon";
	import GearIcon from "phosphor-svelte/lib/GearIcon";
	import MapPinIcon from "phosphor-svelte/lib/MapPinIcon";
	import StarIcon from "phosphor-svelte/lib/StarIcon";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
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
	import { favoriteHasNote } from "$lib/favorites/transfer";
	import { pickTextFile } from "$lib/platform/data-file";

	let backup = $state<Backup | null>(null);
	let restoring = $state(false);
	const parts = $state({ favorites: true, places: true, settings: true });

	const counts = $derived(
		backup === null
			? null
			: {
					favorites: backup.favorites.length,
					noted: backup.favorites.filter((f) => favoriteHasNote(f))
						.length,
					places: backup.places.length,
					settings: backupSettingsCount(backup),
				},
	);
	const anything = $derived(
		counts !== null &&
			((parts.favorites && counts.favorites > 0) ||
				(parts.places && counts.places > 0) ||
				(parts.settings && counts.settings > 0)),
	);

	const count = (n: number, one: string, many: string) =>
		n === 1 ? `1 ${one}` : `${n} ${many}`;

	async function pick() {
		if (restoring) return;
		try {
			const text = await pickTextFile();
			if (text === null) return;
			backup = parseBackup(text);
			parts.favorites = parts.places = parts.settings = true;
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
		const toastId = toast.loading("Restoring…");
		try {
			const result = await restoreBackup(
				backup,
				{ ...parts },
				(done, total) => {
					if (done < total) {
						toast.loading(`Adding favorites ${done} of ${total}…`, {
							id: toastId,
						});
					}
				},
			);
			const problems = [
				result.places && result.places.skipped > 0
					? `${result.places.skipped} places over the limit`
					: null,
				result.favorites && result.favorites.failed > 0
					? `${result.favorites.failed} favorites failed`
					: null,
				result.favorites && result.favorites.notesFailed > 0
					? `${result.favorites.notesFailed} without their note`
					: null,
			].filter((part) => part !== null);
			if (problems.length > 0) {
				toast.warning(`Restored — ${problems.join(", ")}`, {
					id: toastId,
				});
			} else {
				toast.success("Restored", { id: toastId });
			}
			backup = null;
		} catch (caught) {
			console.error(caught);
			toast.dismiss(toastId);
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
	Pick a backup file. Favorites and saved places are added to what you already
	have; settings in the file replace yours.
</p>

{#if backup === null || counts === null}
	<Button variant="outline" class="w-full" onclick={() => void pick()}>
		<FolderOpenIcon weight="fill" />
		Choose a file
	</Button>
{:else}
	{#snippet part(key: keyof typeof parts, title: string, detail: string)}
		<SettingsRow
			as="label"
			{title}
			description={detail}
			disabled={restoring}
		>
			{#snippet icon()}
				{#if key === "favorites"}
					<StarIcon weight="fill" />
				{:else if key === "places"}
					<MapPinIcon weight="fill" />
				{:else}
					<GearIcon weight="fill" />
				{/if}
			{/snippet}
			{#snippet trailing()}
				<Checkbox
					checked={parts[key]}
					disabled={restoring}
					onCheckedChange={(value) => (parts[key] = value === true)}
					aria-label="Restore {title.toLowerCase()}"
				/>
			{/snippet}
		</SettingsRow>
	{/snippet}

	<SettingsGroup divider="full">
		{#if counts.favorites > 0}
			{@render part(
				"favorites",
				"Favorites",
				`${count(counts.favorites, "person", "people")}, ${counts.noted} with notes`,
			)}
		{/if}
		{#if counts.places > 0}
			{@render part(
				"places",
				"Saved places",
				count(counts.places, "place", "places"),
			)}
		{/if}
		{#if counts.settings > 0}
			{@render part(
				"settings",
				"Settings",
				count(counts.settings, "setting", "settings"),
			)}
		{/if}
	</SettingsGroup>

	<div class="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
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
{/if}
