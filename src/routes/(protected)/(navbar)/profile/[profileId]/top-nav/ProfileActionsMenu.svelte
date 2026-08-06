<script lang="ts">
	import {
		CopyIcon,
		DotsThreeIcon,
		FlagIcon,
		ProhibitIcon,
	} from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import ToastUnimplemented from "$lib/components/feedback/ToastUnimplemented.svelte";
	import BlockProfileDialog from "$lib/components/profile/BlockProfileDialog.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";

	let {
		profileId,
		name = null,
		onBlocked,
	}: {
		profileId: number;
		name?: string | null;
		onBlocked: () => void;
	} = $props();

	let submitting = $state(false);
	let blockOpen = $state(false);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props: { class: className, ...props } })}
			<Button
				size="icon-lg"
				variant="secondary"
				aria-label="Profile menu"
				class={[className, "size-12"]}
				disabled={submitting}
				{...props}
			>
				<DotsThreeIcon class="size-8" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content class="w-42" align="end">
		<DropdownMenu.Item
			onSelect={async () => {
				try {
					const clipboard =
						await import("@tauri-apps/plugin-clipboard-manager");
					await clipboard.writeText(String(profileId));
					toast.success("Profile ID copied to clipboard");
				} catch (error) {
					console.error(error);
					showErrorToast({ label: "Failed to copy profile ID", error });
				}
			}}
		>
			<CopyIcon class="size-5" />
			Copy profile ID
		</DropdownMenu.Item>
		<DropdownMenu.Item
			onSelect={() => {
				toast(ToastUnimplemented, {
					componentProps: {
						feature: "Report profile",
						issue: 41,
					},
				});
			}}
		>
			<FlagIcon class="size-5" />
			Report profile
		</DropdownMenu.Item>
		<DropdownMenu.Item
			variant="destructive"
			onSelect={() => (blockOpen = true)}
		>
			<ProhibitIcon class="size-5" />
			Block profile
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>

<BlockProfileDialog bind:open={blockOpen} {profileId} {name} {onBlocked} />
