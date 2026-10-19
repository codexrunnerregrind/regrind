<script lang="ts">
	import GearIcon from "phosphor-svelte/lib/GearIcon";
	import IdentificationCardIcon from "phosphor-svelte/lib/IdentificationCardIcon";
	import ImagesSquareIcon from "phosphor-svelte/lib/ImagesSquareIcon";
	import PaletteIcon from "phosphor-svelte/lib/PaletteIcon";
	import UserCircleIcon from "phosphor-svelte/lib/UserCircleIcon";

	import SectionHeader from "$lib/components/settings/SectionHeader.svelte";
	import SettingsGroup from "$lib/components/settings/SettingsGroup.svelte";
	import SettingsRow from "$lib/components/settings/SettingsRow.svelte";
	import AppVersion from "./AppVersion.svelte";
	import ProfileLink from "./ProfileLink.svelte";
	import SignOutButton from "./SignOutButton.svelte";
	import Socials from "./Socials.svelte";

	const { data }: import("./$types").PageProps = $props();
</script>

<main class="screen-nav-host">
	<div
		data-slot="me-scroller"
		class="h-full w-full overflow-y-auto overscroll-none"
	>
		<div class="flex w-full px-screen pt-4 pb-nav-clear">
			<div class="m-auto flex w-full max-w-120 flex-col pb-16">
				<!-- Titled like the other roots (Inbox, Interest): the screen's own name
				     in the content, not in a nav bar, with the profile card 16pt under
				     it. This tab has no nav bar of its own to carry it. -->
				<h1 class="screen-title mb-4">Settings</h1>

				<ProfileLink id={data.ourProfileId} />

				<!-- Albums sit with the profile card rather than under
				     Preferences: they're the user's own content, not a setting. -->
				<div class="mt-5">
					<SettingsGroup>
						<SettingsRow title="My Albums" href="/albums">
							{#snippet icon()}
								<ImagesSquareIcon weight="fill" />
							{/snippet}
						</SettingsRow>
					</SettingsGroup>
				</div>

				<SectionHeader>Preferences</SectionHeader>
				<SettingsGroup>
					<SettingsRow title="Edit Profile" href="/settings/profile">
						{#snippet icon()}
							<IdentificationCardIcon weight="fill" />
						{/snippet}
					</SettingsRow>
					<SettingsRow
						title="Account Settings"
						href="/settings/account"
					>
						{#snippet icon()}
							<UserCircleIcon weight="fill" />
						{/snippet}
					</SettingsRow>
					<SettingsRow title="App Settings" href="/settings/app">
						{#snippet icon()}
							<GearIcon weight="fill" />
						{/snippet}
					</SettingsRow>
					<SettingsRow title="Appearance" href="/settings/appearance">
						{#snippet icon()}
							<PaletteIcon weight="fill" />
						{/snippet}
					</SettingsRow>
				</SettingsGroup>

				<SectionHeader>About</SectionHeader>
				<SettingsGroup>
					<Socials />
				</SettingsGroup>

				<div class="mt-5">
					<SettingsGroup>
						<SignOutButton />
					</SettingsGroup>
				</div>

				<AppVersion />
			</div>
		</div>
	</div>
</main>
