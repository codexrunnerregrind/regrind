<script lang="ts">
	import SectionFooter from "$lib/components/settings/SectionFooter.svelte";
	import SectionHeader from "$lib/components/settings/SectionHeader.svelte";
	import SettingsGroup from "$lib/components/settings/SettingsGroup.svelte";
	import ShowDistanceSetting from "./ShowDistanceSetting.svelte";

	const { data }: import("./$types").PageProps = $props();
</script>

<SectionHeader>Location</SectionHeader>
<SettingsGroup divider="full">
	<ShowDistanceSetting ourProfileId={data.ourProfileId} />
</SettingsGroup>
<SectionFooter>
	Distance is always approximate. Turning this off hides it from your profile
	and from lists you appear in.
</SectionFooter>
