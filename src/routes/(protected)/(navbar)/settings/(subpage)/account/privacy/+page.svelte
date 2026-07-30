<script lang="ts">
	import SectionFooter from "$lib/components/settings/SectionFooter.svelte";
	import SectionHeader from "$lib/components/settings/SectionHeader.svelte";
	import SettingsGroup from "$lib/components/settings/SettingsGroup.svelte";
	import ShowDistanceSetting from "./ShowDistanceSetting.svelte";
</script>

<SectionHeader>Location</SectionHeader>
<SettingsGroup divider="full">
	<ShowDistanceSetting />
</SettingsGroup>
<SectionFooter>
	Distance is always approximate. Turning this off hides it from your profile
	and from lists you appear in.
</SectionFooter>
