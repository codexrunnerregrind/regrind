<script lang="ts">
	import {
		EnvelopeIcon,
		EyeSlashIcon,
		KeyIcon,
		ProhibitIcon,
		ShieldCheckIcon,
		TrashIcon,
	} from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import ToastUnimplemented from "$lib/components/feedback/ToastUnimplemented.svelte";
	import SectionHeader from "$lib/components/settings/SectionHeader.svelte";
	import SettingsGroup from "$lib/components/settings/SettingsGroup.svelte";
	import SettingsRow from "$lib/components/settings/SettingsRow.svelte";

	function unimplemented() {
		toast(ToastUnimplemented, {
			componentProps: { feature: "Account settings", issue: 47 },
		});
	}
</script>

<SectionHeader>Privacy</SectionHeader>
<SettingsGroup>
	<SettingsRow
		title="Privacy"
		description="Control what other users can see about you."
		href="/settings/account/privacy"
	>
		{#snippet icon()}
			<ShieldCheckIcon weight="fill" />
		{/snippet}
	</SettingsRow>
</SettingsGroup>

<SectionHeader>Sign-in</SectionHeader>
<SettingsGroup>
	<SettingsRow title="Email" onclick={unimplemented}>
		{#snippet icon()}
			<EnvelopeIcon weight="fill" />
		{/snippet}
	</SettingsRow>
	<SettingsRow title="Password" onclick={unimplemented}>
		{#snippet icon()}
			<KeyIcon weight="fill" />
		{/snippet}
	</SettingsRow>
</SettingsGroup>

<SectionHeader>People</SectionHeader>
<SettingsGroup>
	<SettingsRow title="Blocked users" href="/settings/account/blocked">
		{#snippet icon()}
			<ProhibitIcon weight="fill" />
		{/snippet}
	</SettingsRow>
	<SettingsRow title="Hidden users" href="/settings/account/hidden">
		{#snippet icon()}
			<EyeSlashIcon weight="fill" />
		{/snippet}
	</SettingsRow>
</SettingsGroup>

<div class="mt-5">
	<SettingsGroup>
		<SettingsRow
			title="Delete account"
			destructive
			chevron={false}
			onclick={unimplemented}
		>
			{#snippet icon()}
				<TrashIcon weight="fill" />
			{/snippet}
		</SettingsRow>
	</SettingsGroup>
</div>
