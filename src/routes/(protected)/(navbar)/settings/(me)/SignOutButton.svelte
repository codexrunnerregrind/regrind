<script lang="ts">
	import { SignOutIcon } from "phosphor-svelte";

	import { signOut } from "$lib/api/sign-out";
	import SettingsRow from "$lib/components/settings/SettingsRow.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";

	let alertOpen = $state(false);
</script>

<SettingsRow
	title="Sign Out"
	destructive
	chevron={false}
	onclick={() => (alertOpen = true)}
>
	{#snippet icon()}
		<SignOutIcon weight="fill" />
	{/snippet}
</SettingsRow>
<AlertDialog.Root bind:open={alertOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Sign out?</AlertDialog.Title>
			<AlertDialog.Description>
				Are you sure you want to sign out? You can sign back in at any
				time.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel size="lg">Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={() => signOut()} size="lg">
				Continue
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
