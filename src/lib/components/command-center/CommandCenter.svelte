<script lang="ts">
	import { goto } from "$app/navigation";
	import { ClipboardTextIcon, UserIcon } from "phosphor-svelte";
	import { onMount } from "svelte";
	import { tinykeys } from "tinykeys";

	import { showErrorToast } from "$lib/api/error-toast";
	import { Button } from "$lib/components/ui/button";
	import * as Dialog from "$lib/components/ui/dialog";
	import * as InputGroup from "$lib/components/ui/input-group";
	import {
		commandCenterClose,
		commandCenterState,
		parseProfileId,
	} from "./command-center-state.svelte";

	const profileId = $derived(parseProfileId(commandCenterState.query));
	const invalid = $derived(
		commandCenterState.query.trim().length > 0 && profileId === null,
	);

	onMount(() => {
		return tinykeys(window, {
			"$mod+k": (event) => {
				event.preventDefault();
				commandCenterState.open = true;
			},
		});
	});

	async function paste() {
		try {
			const clipboard =
				await import("@tauri-apps/plugin-clipboard-manager");
			commandCenterState.query = (await clipboard.readText()) ?? "";
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Couldn't read the clipboard", error });
		}
	}

	function openProfile() {
		if (profileId === null) return;
		void goto("/profile/" + profileId);
		commandCenterClose();
	}
</script>

<Dialog.Root
	bind:open={
		() => commandCenterState.open,
		(newValue) => {
			if (newValue === true) {
				commandCenterState.open = true;
			} else {
				commandCenterClose();
			}
		}
	}
>
	<Dialog.Content class="top-1/3 translate-y-0 rounded-2xl! sm:max-w-100">
		<Dialog.Header>
			<Dialog.Title>Open profile</Dialog.Title>
			<Dialog.Description>
				Paste a profile ID to go straight to it.
			</Dialog.Description>
		</Dialog.Header>
		<form
			onsubmit={(event) => {
				event.preventDefault();
				openProfile();
			}}
		>
			<InputGroup.Root>
				<InputGroup.Addon>
					<UserIcon />
				</InputGroup.Addon>
				<InputGroup.Input
					autofocus
					inputmode="numeric"
					autocomplete="off"
					aria-label="Profile ID"
					aria-invalid={invalid}
					placeholder="Profile ID"
					bind:value={commandCenterState.query}
				/>
				<InputGroup.Addon align="inline-end">
					<InputGroup.Button
						size="icon-xs"
						aria-label="Paste"
						onclick={paste}
					>
						<ClipboardTextIcon />
					</InputGroup.Button>
				</InputGroup.Addon>
			</InputGroup.Root>
			<Dialog.Footer class="mt-4">
				<Button type="submit" disabled={profileId === null}>
					Open
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
