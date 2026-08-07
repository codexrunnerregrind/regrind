<script lang="ts">
	import SettingsRow from "$lib/components/settings/SettingsRow.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Dialog from "$lib/components/ui/dialog";

	let {
		label,
		destination,
		icon,
		warning,
	}: {
		label: string;
		destination: string;
		icon: import("svelte").Snippet;
		warning?: {
			title: string;
			description: string;
			primary: {
				label: string;
				destination: string;
			};
			secondary: {
				label: string;
				destination: string;
			};
		};
	} = $props();

	let warningOpen = $state(false);
</script>

{#if warning}
	<SettingsRow
		title={label}
		{icon}
		external
		chevron
		onclick={() => (warningOpen = true)}
	/>
{:else}
	<SettingsRow title={label} {icon} href={destination} external />
{/if}
{#if warning}
	{#snippet warningButton(link: {
		variant: import("svelte").ComponentProps<typeof Button>["variant"];
		destination: string;
		label: string;
	})}
		<Button
			variant={link.variant}
			href={link.destination}
			target="_blank"
			rel="nofollow noreferrer noopener"
		>
			<span class="inline-block w-full truncate text-center">
				{link.label}
			</span>
		</Button>
	{/snippet}
	<Dialog.Root bind:open={warningOpen}>
		<Dialog.Content
			showCloseButton={false}
			class="flex flex-col max-settings-dialog:max-w-[calc(100%-1rem)] max-settings-dialog:text-center"
		>
			<Dialog.Header class="max-w-full">
				<Dialog.Title>{warning.title}</Dialog.Title>
				<Dialog.Description>
					{warning.description}
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Footer class="max-w-full flex-col sm:flex-col">
				{@render warningButton({ variant: "default", ...warning.primary })}
				{@render warningButton({ variant: "secondary", ...warning.secondary })}
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
{/if}
